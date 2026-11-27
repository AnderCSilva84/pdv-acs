import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { buildAtendenteEmail } from "../utils/loginAtendente";
export { buildAtendenteEmail };

export async function resolverEmailAtendente(lojaId, nome) {
  const email = buildAtendenteEmail(lojaId, nome);
  try {
    const alias = await getDoc(doc(db, 'logins_atendentes', email));
    const destino = alias.exists() ? String(alias.data().email || "").trim().toLowerCase() : email;
    if (!/^atendente\.[a-z0-9.-]+@acs\.local$/.test(destino)) throw new Error("Nao foi possivel acessar com esse usuario. Utilize seu e-mail de acesso.");
    return destino;
  } catch (error) {
    // Older published rules do not expose this optional alias collection.
    // Fall back only to the existing deterministic Auth address. Password,
    // panel activation and store authorization are still checked after this.
    if (error?.code === 'permission-denied' || error?.code === 'firestore/permission-denied') return email;
    throw error;
  }
}
