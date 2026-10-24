// Connexion Pronote via la bibliothèque `pawnote`.
import { randomUUID } from "node:crypto";
import * as pawnote from "pawnote";

export async function loginPronote({ url, username, password }) {
  if (!url) throw new Error("L'adresse Pronote est obligatoire.");
  if (!username || !password) throw new Error("Identifiant et mot de passe obligatoires.");

  const handle = pawnote.createSessionHandle();
  await pawnote.loginCredentials(handle, {
    url,
    kind: pawnote.AccountKind.STUDENT,
    username,
    password,
    deviceUUID: randomUUID(),
  });
  return handle;
}

export async function fetchPronote(session) {
  const data = {};
  try {
    const tab = session.userResource?.tabs?.get?.(pawnote.TabLocation.Assignments);
    if (tab) data.devoirs = await pawnote.assignmentsFromWeek(session, 1);
  } catch {
    data.devoirs = null;
  }
  return data;
}
