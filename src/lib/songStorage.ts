export {
  getSongsFromCloud as getSongs,
  getSongFromCloud as getSongById,
  saveSongToCloud as saveSong,
  saveSongToCloud as saveSongWithSync,
  deleteSongFromCloud as deleteSong,
  deleteSongFromCloud as deleteSongWithSync,
  duplicateSongInCloud as duplicateSong,
  migrateSongsToCloud,
} from './songStorageCloud';
