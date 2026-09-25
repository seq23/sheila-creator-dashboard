// One help guide, step by step (section 12c). Base stub; the help phase replaces this file.
import { Link, useParams } from "react-router-dom";
import { Empty, PageHead } from "../components/ui";

export function HelpGuide() {
  const { slug } = useParams();
  return (
    <div className="page">
      <PageHead crumb={<Link to="/help">Help</Link>} title={slug?.replace(/-/g, " ") ?? "Guide"} />
      <Empty title="This guide is being written">Every screen gets a picture-by-picture guide. Until then, the "?" on each screen brings you here.</Empty>
    </div>
  );
}
