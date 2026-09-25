// Client Brain. Base stub; the owning phase replaces this file. Route is registered in App.tsx.
import { Empty, HelpButton, PageHead } from "../components/ui";

export function ClientBrain() {
  return (
    <div className="page">
      <PageHead title="Client Brain" />
      <Empty title="Coming in the next release">Upload your brand docs once; the system drafts your Brand Profile, you edit and lock it.</Empty>
      <HelpButton guide="upload-brand-docs" />
    </div>
  );
}
