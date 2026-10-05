import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  MAX_TAGS_PER_SONG,
  TrackDto,
  tagKey,
  tagNameError,
} from '@karaokej/shared';
import { api } from '../api';
import { ModalDialog } from './ModalDialog';

interface AssignProps {
  mode: 'assign';
  track: TrackDto;
  onClose: () => void;
  onSaved: (track: TrackDto) => void;
}

interface CreateProps {
  mode: 'create';
  onClose: () => void;
  onCreated: () => void;
}

type TagPickerModalProps = AssignProps | CreateProps;

export function TagPickerModal(props: TagPickerModalProps) {
  if (props.mode === 'create') {
    return <CreateTagModal onClose={props.onClose} onCreated={props.onCreated} />;
  }
  return (
    <AssignTagModal
      track={props.track}
      onClose={props.onClose}
      onSaved={props.onSaved}
    />
  );
}

function CreateTagModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const validation = tagNameError(name);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createTag(name);
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalDialog open title="Add tag" onClose={onClose} as="form" onSubmit={(event) => void submit(event)}>
      <div className="modal-body">
        <NameField name={name} onChange={setName} />
        {error ? <p className="settings-feedback error">{error}</p> : null}
      </div>
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="modal-primary" disabled={busy}>
          Add tag
        </button>
      </div>
    </ModalDialog>
  );
}

function AssignTagModal({
  track,
  onClose,
  onSaved,
}: {
  track: TrackDto;
  onClose: () => void;
  onSaved: (track: TrackDto) => void;
}) {
  const [catalog, setCatalog] = useState<string[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [embedded, setEmbedded] = useState<string[]>([]);
  const [extraCount, setExtraCount] = useState(0);
  const [initialManaged, setInitialManaged] = useState<string[]>([]);
  const [initialEmbedded, setInitialEmbedded] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([api.tags(), api.trackTags(track.id)])
      .then(([list, state]) => {
        if (cancelled) {
          return;
        }
        const names = list.tags.map((tag) => tag.name);
        setCatalog(names);
        setEmbedded(state.embedded);
        setExtraCount(state.extraCount);
        setInitialManaged(state.managed);
        setInitialEmbedded(state.embedded);
        setChecked(new Set(state.managed.map((item) => tagKey(item))));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [track.id]);

  const selectedNames = useMemo(() => {
    const managed = catalog.filter((item) => checked.has(tagKey(item)));
    return [...managed, ...embedded];
  }, [catalog, checked, embedded]);

  const toggle = (item: string) => {
    const key = tagKey(item);
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    setPendingRemoval(null);
  };

  const addName = async () => {
    const validation = tagNameError(name);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api.createTag(name);
      setCatalog((current) =>
        [...current, created.name].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
      );
      setChecked((current) => new Set(current).add(tagKey(created.name)));
      setName('');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('already exists')) {
        const key = tagKey(name.trim());
        setChecked((current) => new Set(current).add(key));
        setName('');
        setError(null);
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const save = async (confirmed: boolean) => {
    const removed = [
      ...initialManaged.filter((item) => !checked.has(tagKey(item))),
      ...initialEmbedded.filter(
        (item) => !embedded.some((kept) => tagKey(kept) === tagKey(item)),
      ),
    ];
    if (removed.length > 0 && !confirmed) {
      setPendingRemoval(removed);
      return;
    }
    if (selectedNames.length + extraCount > MAX_TAGS_PER_SONG) {
      setError(`A song can have at most ${MAX_TAGS_PER_SONG} mood names.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await api.assignTrackTags(track.id, selectedNames);
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalDialog
      open
      title={`Manage tags — ${track.title}`}
      onClose={onClose}
    >
      <div className="modal-body tag-picker">
        {pendingRemoval ? (
          <>
            <p>
              These tags will be removed from <strong>{track.title}</strong>:
            </p>
            <ul className="tag-picker-remove-list">
              {pendingRemoval.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <ul className="tag-picker-list">
              {catalog.map((item) => (
                <li key={tagKey(item)}>
                  <label>
                    <input
                      type="checkbox"
                      checked={checked.has(tagKey(item))}
                      onChange={() => toggle(item)}
                    />
                    {item}
                  </label>
                </li>
              ))}
              {embedded.map((item) => (
                <li key={`embedded-${tagKey(item)}`}>
                  <label>
                    <input
                      type="checkbox"
                      checked
                      onChange={() =>
                        setEmbedded((current) => current.filter((name) => tagKey(name) !== tagKey(item)))
                      }
                    />
                    {item}
                    <span className="tag-picker-note">Not in the tag list</span>
                  </label>
                </li>
              ))}
            </ul>
            {catalog.length === 0 && embedded.length === 0 ? (
              <p className="settings-copy">No tags yet. Add one below.</p>
            ) : null}
            {extraCount > 0 ? (
              <p className="settings-copy">
                {extraCount} mood {extraCount === 1 ? 'value' : 'values'} on the file{' '}
                {extraCount === 1 ? 'is' : 'are'} not a valid tag name and will stay on the file.
              </p>
            ) : null}
            <div className="tag-picker-create">
              <NameField name={name} onChange={setName} />
              <button type="button" onClick={() => void addName()} disabled={busy}>
                Add tag
              </button>
            </div>
          </>
        )}
        {error ? <p className="settings-feedback error">{error}</p> : null}
      </div>
      <div className="modal-actions">
        <button
          type="button"
          onClick={() => {
            if (pendingRemoval) {
              setPendingRemoval(null);
              return;
            }
            onClose();
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          className="modal-primary"
          disabled={busy}
          onClick={() => void save(pendingRemoval != null)}
        >
          {pendingRemoval ? 'Remove and save' : 'Save'}
        </button>
      </div>
    </ModalDialog>
  );
}

function NameField({
  name,
  onChange,
}: {
  name: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="tag-name-field">
      <span>Tag name</span>
      <input
        type="text"
        value={name}
        maxLength={15}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
