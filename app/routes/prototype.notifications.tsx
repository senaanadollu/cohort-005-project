// PROTOTYPE — the /notifications page. Only Variant C ("Full page") of the
// Notification Feed prototype uses it. Throwaway.

import { useFeedOrNull } from "~/components/prototype-notification-feed/feed";
import { useVariant } from "~/components/prototype-notification-feed/switcher";
import { VariantCPage } from "~/components/prototype-notification-feed/variant-c";

export default function PrototypeNotifications() {
  const feed = useFeedOrNull();
  const [variant] = useVariant();
  if (!feed) return <p className="p-8">Select a user from the DevUI panel.</p>;
  if (variant !== "C")
    return (
      <p className="p-8 text-sm text-muted-foreground">
        This page only exists in Variant C. Switch with the bar at the bottom.
      </p>
    );
  return <VariantCPage />;
}
