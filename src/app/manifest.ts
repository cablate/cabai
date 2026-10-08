import type { MetadataRoute } from "next";
import { BRAND_NAME } from "@/lib/constants";
import { PUBLIC_BRANDING } from "@/lib/config/public-branding";
export default function manifest(): MetadataRoute.Manifest {
  return { name: BRAND_NAME, short_name: BRAND_NAME, description: PUBLIC_BRANDING.description,
    start_url: "/", display: "standalone", icons: [{ src: PUBLIC_BRANDING.logo }] };
}
