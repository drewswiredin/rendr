import { cookies } from "next/headers";

export const GUEST_COOKIE = "rendr-guest";

// The proxy guarantees the cookie exists for every page and API request.
export async function getGuestId(): Promise<string> {
  const store = await cookies();
  const id = store.get(GUEST_COOKIE)?.value;
  if (!id) {
    throw new Error("missing guest cookie");
  }
  return id;
}
