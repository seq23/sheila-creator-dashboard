// Brand deals. Base stub; the owning phase replaces this file. Route is registered in App.tsx.
import { Empty, HelpButton, PageHead } from "../components/ui";

export function Deals() {
  return (
    <div className="page">
      <PageHead title="Brand deals" />
      <Empty title="Coming in the next release">Brands that fit you, public contacts with source links, pitch drafts you send yourself.</Empty>
      <HelpButton guide="send-a-pitch" />
    </div>
  );
}
