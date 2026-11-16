import { redirect } from "react-router";
import type { Route } from "./+types/redeem.$code";

// Seat links used to live at /redeem/:code. Links already shared with team
// members keep working by forwarding to /claim/:code.
export function loader({ params }: Route.LoaderArgs) {
  return redirect(`/claim/${encodeURIComponent(params.code)}`, 301);
}
