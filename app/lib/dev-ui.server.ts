import { db } from "~/db";
import { users } from "~/db/schema";
import { getDevCountry } from "~/lib/session";
import { COUNTRIES, getCountryTierInfo } from "~/lib/ppp";

/** Props for the DevUI panel on pages outside the app layout. Null outside development. */
export async function getDevUIData(request: Request) {
  if (!import.meta.env.DEV) return null;

  const devCountry = await getDevCountry(request);
  return {
    users: db
      .select()
      .from(users)
      .all()
      .map((u) => ({ id: u.id, name: u.name, role: u.role })),
    devCountry,
    countryTierInfo: getCountryTierInfo(devCountry),
    countries: COUNTRIES,
  };
}
