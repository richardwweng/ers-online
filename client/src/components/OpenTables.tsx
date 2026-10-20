import { useEffect, useState } from "react";
import { socket } from "../socket";
import { SLAP_RULES } from "../rules";
import { seatColor } from "../colors";
import { Avatar, EyeIcon } from "./ui";
import type { PublicTable, TablesInfo } from "../types";

type Props = {
  connected: boolean;
  onJoin: (roomId: string, watch: boolean) => void;
};

const ruleLabel = (key: string) => SLAP_RULES.find((r) => r.key === key)?.label ?? key;

function status(t: PublicTable) {
  if (t.phase === "playing") return "In a game";
  if (t.players >= t.maxPlayers) return "Full · starting now";
  if (t.startsIn !== null) return `Starts in ~${Math.ceil(t.startsIn / 1000)}s`;
  return "Waiting for players";
}

// The home page's list of public tables anyone can join, refreshed every few seconds
export default function OpenTables({ connected, onJoin }: Props) {
  const [info, setInfo] = useState<TablesInfo | null>(null);

  useEffect(() => {
    if (!connected) return;
    const load = () => socket.emit("listTables", (res: TablesInfo) => setInfo(res));
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [connected]);

  const tables = info?.tables ?? [];

  return (
    <section className="open-tables" aria-label="Open tables">
      <div className="ot-head">
        <h2 className="ot-title">Open tables</h2>
        {info && (
          <span className="ot-online">
            <span className="status-dot" />
            {info.online} online
          </span>
        )}
      </div>

      {!info ? (
        <div className="ot-empty">
          <p className="note">{connected ? "Looking for tables…" : "Waking up the server…"}</p>
        </div>
      ) : tables.length === 0 ? (
        <div className="ot-empty">
          <p className="ot-empty-title">No open tables right now</p>
          <p className="note">
            Press <b>Quick play</b> to open one. Anyone who visits ERS Online can join it.
          </p>
        </div>
      ) : (
        <div className="ot-grid">
          {tables.map((t) => {
            const canJoin = t.phase === "lobby" && t.players < t.maxPlayers;
            return (
              <article key={t.id} className="ot-card">
                <div className="ot-top">
                  <Avatar name={t.hostName} color={seatColor(0)} size={40} />
                  <div style={{ minWidth: 0 }}>
                    <div className="ot-name">{t.hostName}'s table</div>
                    <div className={`ot-status ${t.phase === "playing" ? "is-live" : ""}`}>{status(t)}</div>
                  </div>
                </div>
                <div className="ot-seats" aria-label={`${t.players} of ${t.maxPlayers} seats taken`}>
                  {Array.from({ length: t.maxPlayers }, (_, i) => (
                    <span key={i} className={`ot-pip ${i < t.players ? "is-filled" : ""}`} style={i < t.players ? { background: seatColor(i).bg } : undefined} />
                  ))}
                  <span className="mono dim small">
                    {t.players}/{t.maxPlayers}
                  </span>
                </div>
                <div className="ot-rules">
                  {t.rules.map((k) => (
                    <span key={k} className="chip">{ruleLabel(k)}</span>
                  ))}
                </div>
                {canJoin ? (
                  <button type="button" className="btn btn-primary btn-sm ot-btn" onClick={() => onJoin(t.id, false)}>
                    Join
                  </button>
                ) : (
                  <button type="button" className="btn btn-ghost btn-sm ot-btn" onClick={() => onJoin(t.id, true)}>
                    <EyeIcon size={15} />
                    Watch
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
