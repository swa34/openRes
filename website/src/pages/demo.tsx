import DemoSection from "@/components/demo/demo-section";
import { PAGE_META } from "@/lib/content";
import { useSeo } from "@/hooks/use-seo";

export function Component() {
  useSeo(PAGE_META.demo);

  return <DemoSection />;
}
