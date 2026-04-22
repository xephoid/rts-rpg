import { uiText, diplomacy as diplomacyConfig } from "@neither/shared";
import type { Faction, DiplomaticProposalKind } from "@neither/shared";
import { useGameStore } from "../../store/gameStore.js";
import { useUIStore } from "../../store/uiStore.js";
import styles from "./DiplomacyPanel.module.css";

function factionLabel(f: Faction): string {
  switch (f) {
    case "wizards": return "Wizards";
    case "robots":  return "Robots";
    case "f3":      return "Faction 3";
    case "f4":      return "Faction 4";
    case "f5":      return "Faction 5";
    case "f6":      return "Faction 6";
  }
}

function kindLabel(kind: DiplomaticProposalKind): string {
  switch (kind) {
    case "openBorders":     return uiText.diplomacy.openBordersLabel;
    case "nonCombat":       return uiText.diplomacy.nonCombatTreatyLabel;
    case "resourceRequest": return uiText.diplomacy.proposeResourceRequest;
    case "unitRequest":     return uiText.diplomacy.proposeUnitRequest;
  }
}

export function DiplomacyPanel() {
  const gameState = useGameStore((s) => s.gameState);
  const activeFaction = useUIStore((s) => s.activeFaction);
  const issueDiplomaticProposal = useUIStore((s) => s.issueDiplomaticProposal);
  const issueDiplomaticResponse = useUIStore((s) => s.issueDiplomaticResponse);

  if (!gameState) return null;

  const own = gameState.factionStats[activeFaction];
  const pending = gameState.diplomacy.pendingProposals;
  const incoming = pending.filter((p) => p.to === activeFaction);
  const met = new Set(gameState.diplomacy.metFactions[activeFaction]);
  const opposing = gameState.activeFactions.filter((f) => f !== activeFaction && met.has(f));

  return (
    <div className={styles.panel}>
      <div className={styles.header}>{uiText.diplomacy.panelHeader}</div>

      {opposing.length === 0 && (
        <div className={styles.section}>
          <div className={styles.empty}>{uiText.diplomacy.unmetNotice}</div>
        </div>
      )}

      {/* Alignment bars */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>{uiText.diplomacy.alignmentLabel}</div>
        {opposing.map((f) => {
          const align = own.alignment[f];
          const pct = Math.max(-100, Math.min(100, align)) / 100; // -1..+1
          const width = `${Math.abs(pct) * 50}%`;
          return (
            <div key={f} className={styles.alignmentRow}>
              <span>{factionLabel(f)}</span>
              <span className={styles.alignmentTrack}>
                <span
                  className={`${styles.alignmentFill} ${pct >= 0 ? styles.alignmentFillPositive : styles.alignmentFillNegative}`}
                  style={{ width }}
                />
              </span>
              <span className={styles.alignmentValue}>{Math.round(align)}</span>
            </div>
          );
        })}
      </div>

      {/* Active agreements */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>{uiText.diplomacy.activeAgreements}</div>
        {opposing.map((f) => {
          const ob = own.openBorders[f];
          const nc = own.nonCombatTreaties[f];
          if (!ob && !nc) return (
            <div key={f} className={styles.empty}>No agreements with {factionLabel(f)}</div>
          );
          return (
            <div key={f}>
              {ob && <span className={styles.agreementTag}>
                {uiText.diplomacy.openBordersLabel} · {factionLabel(f)}
              </span>}
              {nc && <span className={styles.agreementTag}>
                {uiText.diplomacy.nonCombatTreatyLabel} · {factionLabel(f)}
              </span>}
            </div>
          );
        })}
      </div>

      {/* Incoming proposals */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>{uiText.diplomacy.incomingProposals}</div>
        {incoming.length === 0 && <div className={styles.empty}>None</div>}
        {incoming.map((p) => (
          <div key={p.id} className={styles.proposalCard}>
            <div className={styles.proposalLabel}>
              {factionLabel(p.from)}: {kindLabel(p.kind)}
              {p.resource && ` (${p.resource.amount} ${p.resource.kind})`}
            </div>
            <div className={styles.proposalButtons}>
              <button
                className={styles.acceptBtn}
                onClick={() => issueDiplomaticResponse(p.id, true)}
              >
                {uiText.diplomacy.accept}
              </button>
              <button
                className={styles.declineBtn}
                onClick={() => issueDiplomaticResponse(p.id, false)}
              >
                {uiText.diplomacy.decline}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Outgoing proposals */}
      {opposing.map((target) => {
        const ob = own.openBorders[target];
        const nc = own.nonCombatTreaties[target];
        const hasPendingOB = pending.some((p) => p.from === activeFaction && p.to === target && p.kind === "openBorders");
        const hasPendingNC = pending.some((p) => p.from === activeFaction && p.to === target && p.kind === "nonCombat");
        return (
          <div key={target} className={styles.section}>
            <div className={styles.sectionTitle}>
              {uiText.diplomacy.outgoingActions} {factionLabel(target)}
            </div>
            {!ob && !hasPendingOB && (
              <button
                className={styles.proposeBtn}
                onClick={() => issueDiplomaticProposal({ sender: activeFaction, target, kind: "openBorders" })}
              >
                {uiText.diplomacy.proposeOpenBorders}
              </button>
            )}
            {!nc && !hasPendingNC && (
              <button
                className={styles.proposeBtn}
                onClick={() => issueDiplomaticProposal({ sender: activeFaction, target, kind: "nonCombat" })}
              >
                {uiText.diplomacy.proposeNonCombat}
              </button>
            )}
            <button
              className={styles.proposeBtn}
              onClick={() =>
                issueDiplomaticProposal({
                  sender: activeFaction,
                  target,
                  kind: "resourceRequest",
                  resource: { kind: "wood", amount: 50 },
                })
              }
            >
              {uiText.diplomacy.proposeResourceRequest} (50 wood)
            </button>
            {/* Request Unit — surface every visible (fog-revealed) unit of the
                target's faction as a clickable row. Sends a unitRequest
                proposal for that specific instance; on accept, the unit
                transfers to the player's faction. Hidden units (in platform,
                garrison, cottage, covered by fog) are filtered out. */}
            {(() => {
              const viewerFog = gameState.fog[activeFaction];
              const fogW = viewerFog?.width ?? 0;
              const fogData = viewerFog?.data;
              const visibleAllyUnits = gameState.entities.filter((e) => {
                if (e.kind !== "unit" || e.faction !== target) return false;
                if (e.isShell || e.garrisoned || e.inPlatform || e.hidden) return false;
                if (!fogData || fogW === 0) return true;
                const idx = Math.floor(e.position.y) * fogW + Math.floor(e.position.x);
                return (fogData[idx] ?? 0) === 2; // currently visible
              }).slice(0, 8);
              const hasPendingUnitReq = (id: string) => pending.some(
                (p) => p.from === activeFaction && p.to === target && p.kind === "unitRequest" && p.unitId === id,
              );
              return (
                <>
                  {visibleAllyUnits.length > 0 && (
                    <div className={styles.sectionTitle}>{uiText.diplomacy.proposeUnitRequest}</div>
                  )}
                  {visibleAllyUnits.map((u) => (
                    <button
                      key={u.id}
                      className={styles.proposeBtn}
                      disabled={hasPendingUnitReq(u.id)}
                      onClick={() =>
                        issueDiplomaticProposal({
                          sender: activeFaction,
                          target,
                          kind: "unitRequest",
                          unitId: u.id,
                        })
                      }
                      title={`Request ${u.name ?? u.typeKey}`}
                    >
                      {u.name ?? u.typeKey}
                    </button>
                  ))}
                </>
              );
            })()}
            {/* The AI accept gate lives at +{aiAcceptThreshold} alignment — surfaced here
                so the player can see why a proposal might bounce. */}
            <div className={styles.empty} style={{ marginTop: 2 }}>
              AI accepts at alignment ≥ {diplomacyConfig.aiAcceptThreshold}
            </div>
          </div>
        );
      })}
    </div>
  );
}
