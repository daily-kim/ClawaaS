/**
 * Purpose: Default route that redirects to the first unauthenticated entrypoint.
 * TODO: Switch this to a real auth-aware redirect once session state is available on the server.
 */

import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/login");
}
