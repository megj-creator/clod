import UncoverApp from "@/components/UncoverApp";
import { loadCity } from "@/lib/load";

// Runs at build time: reads /data/cities/charleston and hands it to the app.
export default function Page() {
  const city = loadCity("charleston");
  return <UncoverApp city={city} />;
}
