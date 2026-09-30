import UncoverApp from "@/components/UncoverApp";
import { loadCity } from "@/lib/load";

// Runs at build time: reads the hand-checked featured city from /data/cities/charleston.
// Every other destination is searched on the fly (see /api/city and /api/places).
export default function Page() {
  const featured = loadCity("charleston");
  return <UncoverApp featured={featured} />;
}
