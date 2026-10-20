import { kv } from "../db/kv.ts";

export interface Note {
  id: string;
  text: string;
  updatedAt: number;
}

type Notebook = Record<string, { text: string; updatedAt: number }>;

const notebookKey = (ownerId: string) => `notes:${ownerId}`;

async function loadNotebook(ownerId: string): Promise<Notebook> {
  return (await kv.get<Notebook>(notebookKey(ownerId))) ?? {};
}

export async function saveNote(ownerId: string, id: string, text: string): Promise<void> {
  const notebook = await loadNotebook(ownerId);
  notebook[id] = { text, updatedAt: Date.now() };
  await kv.set(notebookKey(ownerId), notebook);
}

export async function getNote(ownerId: string, id: string): Promise<Note | null> {
  const note = (await loadNotebook(ownerId))[id];
  return note ? { id, ...note } : null;
}

export async function deleteNote(ownerId: string, id: string): Promise<boolean> {
  const notebook = await loadNotebook(ownerId);
  if (!notebook[id]) return false;
  delete notebook[id];
  await kv.set(notebookKey(ownerId), notebook);
  return true;
}

export async function listNotes(ownerId: string): Promise<Note[]> {
  return Object.entries(await loadNotebook(ownerId)).map(([id, note]) => ({ id, ...note }));
}
