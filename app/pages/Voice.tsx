// Voice. Base stub; the owning phase replaces this file. Route is registered in App.tsx.
import { Empty, HelpButton, PageHead } from "../components/ui";

export function Voice() {
  return (
    <div className="page">
      <PageHead title="Voice" />
      <Empty title="Coming in the next release">Record a sample once, write or draft a script, generate narration.</Empty>
      <HelpButton guide="record-your-voice" />
    </div>
  );
}
