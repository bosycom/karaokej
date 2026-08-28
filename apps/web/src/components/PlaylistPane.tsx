import { FormEvent, ReactNode, useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { FiEdit2, FiPlay, FiPlus, FiTrash2 } from 'react-icons/fi';
import { PlaylistDetailDto, PlaylistSummaryDto } from '@karaokej/shared';
import { playlistDropId } from '../dnd/dragIds';
import { PlaylistItemList } from './PlaylistItemList';

interface PlaylistPaneProps {
  summaries: PlaylistSummaryDto[];
  selectedId: number | null;
  detail: PlaylistDetailDto | null;
  dropActivePlaylistId: number | null;
  onSelect: (id: number) => void;
  onCreate: (name: string) => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  onRemoveItem: (itemId: number) => void;
  onPlay: (id: number) => void;
}

export function PlaylistPane({
  summaries,
  selectedId,
  detail,
  dropActivePlaylistId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onRemoveItem,
  onPlay,
}: PlaylistPaneProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  const filteredSummaries = useMemo(() => {
    const needle = searchFilter.trim().toLowerCase();
    if (!needle) {
      return summaries;
    }
    return summaries.filter((playlist) => playlist.name.toLowerCase().includes(needle));
  }, [summaries, searchFilter]);

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      return;
    }
    onCreate(trimmed);
    setNewName('');
    setCreating(false);
  };

  const startRename = (playlist: PlaylistSummaryDto) => {
    setEditingId(playlist.id);
    setEditName(playlist.name);
  };

  const commitRename = (id: number) => {
    const trimmed = editName.trim();
    if (trimmed) {
      onRename(id, trimmed);
    }
    setEditingId(null);
    setEditName('');
  };

  const selected = summaries.find((entry) => entry.id === selectedId) ?? null;

  return (
    <aside className="playlist-pane">
      <div className="playlist-pane-toolbar">
        <h2>Playlists</h2>
        <button
          type="button"
          className="icon-btn"
          title="New playlist"
          aria-label="New playlist"
          onClick={() => setCreating((value) => !value)}
        >
          <FiPlus aria-hidden />
        </button>
      </div>

      <form
        className="search playlist-search"
        onSubmit={(event) => event.preventDefault()}
      >
        <input
          name="playlist-q"
          placeholder="Search playlists"
          value={searchFilter}
          onChange={(event) => setSearchFilter(event.target.value)}
          autoComplete="off"
        />
        <button type="button" disabled={searchFilter === ''} onClick={() => setSearchFilter('')}>
          Reset
        </button>
      </form>

      {creating && (
        <form className="playlist-create" onSubmit={submitCreate}>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Playlist name"
            autoFocus
          />
          <button type="submit" disabled={!newName.trim()}>
            Create
          </button>
        </form>
      )}

      {summaries.length === 0 ? (
        <p className="empty">Create a playlist, then drag songs from the library onto its name.</p>
      ) : filteredSummaries.length === 0 ? (
        <p className="empty">No playlists match your search.</p>
      ) : (
        <ul className="playlist-name-list">
          {filteredSummaries.map((playlist) => (
            <PlaylistNameRow
              key={playlist.id}
              playlist={playlist}
              selected={playlist.id === selectedId}
              dropActive={dropActivePlaylistId === playlist.id}
              editing={editingId === playlist.id && playlist.id !== selectedId}
              editName={editName}
              onSelect={() => onSelect(playlist.id)}
              onStartRename={() => startRename(playlist)}
              onEditNameChange={setEditName}
              onCommitRename={() => commitRename(playlist.id)}
              onCancelRename={() => setEditingId(null)}
            />
          ))}
        </ul>
      )}

      {selected && detail && (
        <section className="playlist-detail">
          <div className="playlist-detail-header">
            <PlaylistDropTarget
              playlistId={selected.id}
              dropActive={dropActivePlaylistId === selected.id}
              className="playlist-detail-title"
            >
              {editingId === selected.id ? (
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  onBlur={() => commitRename(selected.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      commitRename(selected.id);
                    }
                    if (event.key === 'Escape') {
                      setEditingId(null);
                    }
                  }}
                  autoFocus
                />
              ) : (
                <span className="playlist-name-button selected-name">{selected.name}</span>
              )}
            </PlaylistDropTarget>
            <div className="playlist-detail-actions">
              <button
                type="button"
                className="icon-btn"
                title="Rename playlist"
                aria-label="Rename playlist"
                onClick={() => startRename(selected)}
              >
                <FiEdit2 aria-hidden />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Play playlist"
                aria-label="Play playlist"
                onClick={() => onPlay(selected.id)}
              >
                <FiPlay aria-hidden />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Delete playlist"
                aria-label="Delete playlist"
                onClick={() => onDelete(selected.id)}
              >
                <FiTrash2 aria-hidden />
              </button>
            </div>
          </div>

          {detail.items.length === 0 ? (
            <p className="empty">
              {dropActivePlaylistId === selected.id
                ? 'Drop to add to this playlist'
                : 'Drag songs here from the library.'}
            </p>
          ) : (
            <PlaylistItemList
              items={detail.items}
              onRemove={onRemoveItem}
            />
          )}
        </section>
      )}
    </aside>
  );
}

function PlaylistNameRow({
  playlist,
  selected,
  dropActive,
  editing,
  editName,
  onSelect,
  onStartRename,
  onEditNameChange,
  onCommitRename,
  onCancelRename,
}: {
  playlist: PlaylistSummaryDto;
  selected: boolean;
  dropActive: boolean;
  editing: boolean;
  editName: string;
  onSelect: () => void;
  onStartRename: () => void;
  onEditNameChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
}) {
  return (
    <li className={`${selected ? 'selected' : ''}${dropActive ? ' drop-active' : ''}`}>
      <PlaylistDropTarget playlistId={playlist.id} dropActive={dropActive}>
        {editing ? (
          <input
            value={editName}
            onChange={(event) => onEditNameChange(event.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onCommitRename();
              }
              if (event.key === 'Escape') {
                onCancelRename();
              }
            }}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className={`playlist-name-button${selected ? ' current' : ''}`}
            onClick={onSelect}
            onDoubleClick={(event) => {
              event.preventDefault();
              onStartRename();
            }}
            title={`${playlist.name} (${playlist.itemCount} songs). Double-click to rename.`}
          >
            <span>{playlist.name}</span>
            <span className="playlist-count">{playlist.itemCount}</span>
          </button>
        )}
      </PlaylistDropTarget>
    </li>
  );
}

function PlaylistDropTarget({
  playlistId,
  dropActive,
  className,
  children,
}: {
  playlistId: number;
  dropActive: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({
    id: playlistDropId(playlistId),
    data: { kind: 'playlist', id: playlistId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`playlist-drop-target${dropActive ? ' drop-active' : ''}${className ? ` ${className}` : ''}`}
    >
      {children}
    </div>
  );
}
