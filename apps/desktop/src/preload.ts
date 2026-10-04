import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('karaokejDesktop', {
  pickLibraryFolders: (): Promise<string[]> =>
    ipcRenderer.invoke('karaokej:pick-library-folders'),
});
