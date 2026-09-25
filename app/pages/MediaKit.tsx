// Public media kit page (section 12b.1), phone-friendly, no login. Base stub; phase 10 replaces it.
import { useParams } from "react-router-dom";
import type { MediaKitPublic } from "@shared/types";
import { get } from "../lib/api";
import { Skeleton, useLoad } from "../components/ui";

export function MediaKit() {
  const { slug } = useParams();
  const { data, loading, error } = useLoad(() => get<MediaKitPublic>(`/api/public/kit/${slug}`), [slug]);
  return (
    <div className="login-wrap" style={{ alignItems: "start" }}>
      <div className="login-card" style={{ width: "min(640px, 100%)" }}>
        <span className="brand-mark">
          <img src="/assets/brand/sheila-logo.png" alt="Sheila Bruce" />
        </span>
        {loading && !data ? <Skeleton /> : null}
        {error ? <p className="soft">No media kit at this address.</p> : null}
        {data ? (
          <>
            <div style={{ textAlign: "center" }}>
              <div className="script" style={{ fontSize: "1.9rem", lineHeight: 1 }}>media kit</div>
              <h1 style={{ fontSize: "1.8rem" }}>{data.name}</h1>
            </div>
            <p className="soft">{data.bio || "Bio coming soon."}</p>
            {data.contact_email ? (
              <a className="btn" href={`mailto:${data.contact_email}`}>Get in touch</a>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
