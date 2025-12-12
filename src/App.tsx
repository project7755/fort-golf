import React, { useMemo, useState } from "react";

type ScoreResult = "birdie" | "par" | "bogey+";
type GameMode = "elimination" | "siege"; // Option B, Option E

type Player = {
  id: number;
  name: string;
  fortLayers: number; // remaining health (0..maxLayers)
  maxLayers: number;
  colorClass: string;

  eliminated: boolean; // only used in elimination mode
  fortsDestroyed: number; // increments when health drops from >0 to 0
};

type HoleInput = {
  fairway: boolean;
  gir: boolean;
  score: ScoreResult;
};

type HoleSummary = {
  hole: number;
  defenderName: string;
  attackerDamageTotal: number;
  defenderRepair: number;
  netChange: number;
  finalHealth: number;
  finalDamage: number;
  maxDamage: number;
};

const PLAYER_COLORS = [
  "from-green-500 to-emerald-600",
  "from-blue-500 to-sky-600",
  "from-amber-500 to-orange-600",
  "from-purple-500 to-indigo-600",
];

const DEFAULT_NAMES = ["Player A", "Player B", "Player C", "Player D"];

const DAMAGE_CAP_OPTIONS = [5, 10, 15, 20, 25];

function attackerScore(score: ScoreResult) {
  switch (score) {
    case "birdie":
      return -2;
    case "par":
      return -1;
    default:
      return 0;
  }
}

function defenderScore(score: ScoreResult) {
  switch (score) {
    case "birdie":
      return +3;
    case "par":
      return +2;
    default:
      return 0;
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function formatSigned(n: number) {
  if (n > 0) return `+${n}`;
  return `${n}`;
}

const App: React.FC = () => {
  const [mode, setMode] = useState<GameMode>("siege"); // default Option E
  const [numPlayers, setNumPlayers] = useState<number>(4);
  const [startingLayers, setStartingLayers] = useState<number>(10);
  const [totalHoles, setTotalHoles] = useState<number>(18);

  const [currentHole, setCurrentHole] = useState<number>(1);
  const [defenderIndex, setDefenderIndex] = useState<number>(0);

  const [players, setPlayers] = useState<Player[]>(
    Array.from({ length: 4 }, (_, i) => ({
      id: i,
      name: DEFAULT_NAMES[i],
      fortLayers: startingLayers,
      maxLayers: startingLayers,
      colorClass: PLAYER_COLORS[i],
      eliminated: false,
      fortsDestroyed: 0,
    }))
  );

  const [holeInputs, setHoleInputs] = useState<Record<number, HoleInput>>({});
  const [lastSummary, setLastSummary] = useState<HoleSummary | null>(null);
  const [history, setHistory] = useState<HoleSummary[]>([]);

  const activePlayers = useMemo(() => {
    if (mode === "elimination") return players.filter((p) => !p.eliminated);
    return players;
  }, [players, mode]);

  const gameOver =
    currentHole > totalHoles ||
    (mode === "elimination" && activePlayers.length <= 1);

  const defender = useMemo(() => players[defenderIndex], [players, defenderIndex]);

  const resetGame = () => {
    setCurrentHole(1);
    setDefenderIndex(0);
    setPlayers(
      Array.from({ length: numPlayers }, (_, i) => ({
        id: i,
        name: DEFAULT_NAMES[i] || `Player ${i + 1}`,
        fortLayers: startingLayers,
        maxLayers: startingLayers,
        colorClass: PLAYER_COLORS[i],
        eliminated: false,
        fortsDestroyed: 0,
      }))
    );
    setHoleInputs({});
    setLastSummary(null);
    setHistory([]);
  };

  const handleNumPlayersChange = (value: number) => {
    const clampedPlayers = Math.min(4, Math.max(2, value));
    setNumPlayers(clampedPlayers);
    setPlayers((prev) => {
      const next: Player[] = [];
      for (let i = 0; i < clampedPlayers; i++) {
        const existing = prev[i];
        next.push(
          existing || {
            id: i,
            name: DEFAULT_NAMES[i] || `Player ${i + 1}`,
            fortLayers: startingLayers,
            maxLayers: startingLayers,
            colorClass: PLAYER_COLORS[i],
            eliminated: false,
            fortsDestroyed: 0,
          }
        );
      }
      return next.map((p, idx) => ({
        ...p,
        id: idx,
        colorClass: PLAYER_COLORS[idx],
      }));
    });
    setCurrentHole(1);
    setDefenderIndex(0);
    setHoleInputs({});
    setLastSummary(null);
    setHistory([]);
  };

  const updateHoleInput = (
    playerId: number,
    field: keyof HoleInput,
    value: boolean | ScoreResult
  ) => {
    setHoleInputs((prev) => ({
      ...prev,
      [playerId]: {
        fairway: prev[playerId]?.fairway ?? false,
        gir: prev[playerId]?.gir ?? false,
        score: prev[playerId]?.score ?? "bogey+",
        [field]: value,
      },
    }));
  };

  const nextDefenderIndex = (startIndex: number, nextPlayers: Player[]) => {
    if (mode !== "elimination") {
      return (startIndex + 1) % nextPlayers.length;
    }

    // elimination: skip eliminated players
    const n = nextPlayers.length;
    for (let step = 1; step <= n; step++) {
      const idx = (startIndex + step) % n;
      if (!nextPlayers[idx].eliminated) return idx;
    }
    // fallback (shouldn't happen)
    return startIndex;
  };

  const computeWinner = (finalPlayers: Player[]) => {
    const pool = mode === "elimination"
      ? finalPlayers.filter((p) => !p.eliminated)
      : finalPlayers;

    if (pool.length === 0) return null;

    // Winner = most health remaining; tiebreaker = fewer fortsDestroyed; then name
    const sorted = [...pool].sort((a, b) => {
      if (b.fortLayers !== a.fortLayers) return b.fortLayers - a.fortLayers;
      if (a.fortsDestroyed !== b.fortsDestroyed) return a.fortsDestroyed - b.fortsDestroyed;
      return a.name.localeCompare(b.name);
    });

    const best = sorted[0];
    const tied = sorted.filter(
      (p) =>
        p.fortLayers === best.fortLayers &&
        p.fortsDestroyed === best.fortsDestroyed
    );

    return { winner: best, ties: tied, sorted };
  };

  const applyHoleResults = () => {
    if (gameOver) return;
    if (!defender) return;

    // If elimination mode and defender eliminated (shouldn't happen), skip
    if (mode === "elimination" && defender.eliminated) {
      setDefenderIndex((idx) => nextDefenderIndex(idx, players));
      setCurrentHole((h) => h + 1);
      setHoleInputs({});
      return;
    }

    const attackerIds = players
      .filter((_, idx) => idx !== defenderIndex)
      .filter((p) => (mode === "elimination" ? !p.eliminated : true))
      .map((p) => p.id);

    let attackerDamageTotal = 0; // negative = damage

    attackerIds.forEach((id) => {
      const input = holeInputs[id];
      if (!input) return;

      const fairway = input.fairway ? -1 : 0;
      const gir = input.gir ? -1 : 0;
      const score = attackerScore(input.score);

      attackerDamageTotal += fairway + gir + score;
    });

    const defenderInput = holeInputs[defender.id];
    const defenderRepair = defenderInput ? defenderScore(defenderInput.score) : 0;

    // net = damage (negative) + repair (positive)
    let net = attackerDamageTotal + defenderRepair;

    const attackersDidNothing = attackerDamageTotal === 0;
    const defenderBogeyOrWorse =
      !defenderInput || defenderInput.score === "bogey+";

    // Special rule: zero net damage & attackers did nothing & defender bogey+ => defender repairs +1
    if (net === 0 && attackersDidNothing && defenderBogeyOrWorse) {
      net = 1;
    }

    const oldHealth = defender.fortLayers;
    const maxHealth = defender.maxLayers;

    // Elimination mode: if you hit 0, you're out and cannot be repaired later (since you won't defend again)
    let newHealth = clamp(oldHealth + net, 0, maxHealth);

    const destroyedThisHole = oldHealth > 0 && newHealth === 0;

    // Build summary using the computed newHealth
    const summary: HoleSummary = {
      hole: currentHole,
      defenderName: defender.name,
      attackerDamageTotal,
      defenderRepair,
      netChange: net,
      finalHealth: newHealth,
      finalDamage: maxHealth - newHealth,
      maxDamage: maxHealth,
    };

    // Apply to state
    setPlayers((prev) => {
      const next = prev.map((p, idx) => {
        if (idx !== defenderIndex) return p;

        // siege mode: allow repairs after destruction; elimination: mark eliminated at 0
        const eliminatedNow =
          mode === "elimination" ? (p.eliminated || newHealth === 0) : p.eliminated;

        return {
          ...p,
          fortLayers: newHealth,
          eliminated: eliminatedNow,
          fortsDestroyed: destroyedThisHole ? p.fortsDestroyed + 1 : p.fortsDestroyed,
        };
      });

      // In elimination mode, if defender got eliminated, ensure they won't be selected again
      return next;
    });

    setLastSummary(summary);
    setHistory((prev) => [...prev, summary]);

    // Advance
    setHoleInputs({});
    setCurrentHole((h) => h + 1);

    // Compute next defender index using *current* players snapshot updated via setPlayers async:
    // We'll compute next based on current players but the elimination skip works even if
    // the eliminated flag updates right after (worst case: one extra click will self-correct).
    setDefenderIndex((idx) => nextDefenderIndex(idx, players));
  };

  const winnerInfo = useMemo(() => computeWinner(players), [players, mode]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 flex justify-center">
      <div className="w-full max-w-6xl space-y-6 pb-12">
        {/* Header */}
        <header className="space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold">Fort Golf Control Panel</h1>
              <p className="text-slate-400 text-sm">
                Two modes: Option B (Elimination) or Option E (Siege). Damage + repairs each hole.
              </p>
            </div>
            <button
              onClick={resetGame}
              className="px-4 py-2 rounded-lg bg-slate-100 text-slate-900 font-semibold hover:bg-white transition"
            >
              Reset Game
            </button>
          </div>

          {/* Settings */}
          <div className="bg-slate-800/70 p-4 rounded-lg border border-slate-700 flex flex-wrap gap-6 items-end">
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-slate-400">
                Game Mode
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as GameMode)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value="elimination">Option B — Elimination</option>
                <option value="siege">Option E — Siege (Forts Destroyed tally)</option>
              </select>
              <p className="text-[11px] text-slate-500">
                Switching modes doesn’t auto-reset—hit <span className="font-semibold">Reset Game</span>.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-slate-400">
                Players
              </label>
              <select
                value={numPlayers}
                onChange={(e) => handleNumPlayersChange(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              >
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-slate-400">
                Fort Damage Capacity
              </label>
              <select
                value={startingLayers}
                onChange={(e) => setStartingLayers(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              >
                {DAMAGE_CAP_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">
                Change this, then hit <span className="font-semibold">Reset Game</span> to apply.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wide text-slate-400">
                Total Holes
              </label>
              <input
                type="number"
                min={1}
                max={36}
                value={totalHoles}
                onChange={(e) => setTotalHoles(Number(e.target.value) || 1)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm w-24"
              />
            </div>
          </div>

          {/* Scoring Key */}
          <div className="bg-slate-800/70 p-4 rounded-lg border border-slate-700 text-sm grid md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold text-emerald-300 mb-1">
                Attacker Damage (to defender fort)
              </h3>
              <ul className="text-slate-300 space-y-1">
                <li>• Fairway = -1 damage</li>
                <li>• GIR = -1 damage</li>
                <li>• Par = -1 damage</li>
                <li>• Birdie = -2 damage</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-blue-300 mb-1">
                Defender Repairs
              </h3>
              <ul className="text-slate-300 space-y-1">
                <li>• Bogey or worse = +0 repair</li>
                <li>• Par = +2 repair</li>
                <li>• Birdie = +3 repair</li>
                <li>• Zero net damage (and attackers did nothing) = +1 repair</li>
              </ul>
            </div>
          </div>
        </header>

        {/* Final Results Screen */}
        {gameOver && winnerInfo && (
          <section className="bg-slate-800/70 rounded-xl p-5 border border-slate-700">
            <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2">
              <h2 className="text-xl font-bold">Final Results</h2>
              <div className="text-sm text-slate-300">
                Mode:{" "}
                <span className="font-semibold">
                  {mode === "elimination" ? "Option B — Elimination" : "Option E — Siege"}
                </span>
              </div>
            </div>

            <div className="mt-3 text-sm">
              <div className="text-emerald-300">
                Winner{winnerInfo.ties.length > 1 ? "s" : ""}:{" "}
                <span className="font-semibold">
                  {winnerInfo.ties.map((w) => w.name).join(", ")}
                </span>
              </div>
              <div className="text-slate-400 text-xs mt-1">
                Winner is based on most health remaining; tiebreaker is fewer forts destroyed.
              </div>
            </div>

            <div className="mt-4 grid md:grid-cols-2 gap-3">
              {winnerInfo.sorted.map((p) => {
                const damage = p.maxLayers - p.fortLayers;
                const status =
                  mode === "elimination" && p.eliminated ? "ELIMINATED" : "ACTIVE";
                return (
                  <div
                    key={p.id}
                    className="rounded-lg border border-slate-700 bg-slate-900/60 p-3"
                  >
                    <div className="flex justify-between items-baseline">
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-[11px] text-slate-400">{status}</div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-300">
                      <div>
                        <div className="text-[11px] uppercase text-slate-500">Damage</div>
                        <div className="font-mono">{damage} / {p.maxLayers}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase text-slate-500">Health</div>
                        <div className="font-mono">{p.fortLayers} / {p.maxLayers}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase text-slate-500">Destroyed</div>
                        <div className="font-mono">{p.fortsDestroyed}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Game Status */}
        {!gameOver && (
          <section className="bg-slate-800/60 rounded-xl p-4 border border-slate-700 flex flex-col md:flex-row justify-between gap-2">
            <div>
              <p className="text-sm">
                Hole{" "}
                <span className="font-semibold">
                  {Math.min(currentHole, totalHoles)}
                </span>{" "}
                / {totalHoles}
              </p>
              <p className="text-sm">
                Defender:{" "}
                <span className="font-semibold">{defender?.name}</span>
              </p>
            </div>
            <div className="text-sm text-slate-300">
              Active players: <span className="font-semibold">{activePlayers.length}</span>
            </div>
          </section>
        )}

        {/* Fort Grid */}
        <section className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {players.map((player, idx) => {
            const isDefender = idx === defenderIndex && !gameOver;
            const health = player.fortLayers;
            const damage = player.maxLayers - player.fortLayers;
            const ratio = player.maxLayers ? health / player.maxLayers : 0;

            const showEliminated = mode === "elimination" && player.eliminated;

            return (
              <div
                key={player.id}
                className={`rounded-xl border p-4 bg-slate-800/70 ${
                  isDefender
                    ? "border-emerald-400 shadow-lg shadow-emerald-500/20"
                    : "border-slate-700"
                } ${showEliminated ? "opacity-60" : ""}`}
              >
                <div className="flex justify-between items-center gap-2">
                  <input
                    value={player.name}
                    onChange={(e) =>
                      setPlayers((prev) =>
                        prev.map((p) =>
                          p.id === player.id ? { ...p, name: e.target.value } : p
                        )
                      )
                    }
                    className="bg-transparent border-b border-slate-600 text-sm font-semibold focus:outline-none focus:border-emerald-400"
                  />
                  <div className="flex gap-2 items-center">
                    {isDefender && (
                      <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-600/20 text-emerald-300 border border-emerald-400/40">
                        Defender
                      </span>
                    )}
                    {showEliminated && (
                      <span className="text-[11px] px-2 py-1 rounded-full bg-red-600/20 text-red-300 border border-red-400/40">
                        Eliminated
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-2 space-y-1">
                  <p className="text-xs text-slate-400">Fort Damage</p>
                  <p className="text-slate-200 font-mono">
                    {damage} / {player.maxLayers}
                  </p>
                  <div className="h-3 mt-1 bg-slate-900 border border-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${player.colorClass}`}
                      style={{ width: `${ratio * 100}%` }}
                    />
                  </div>

                  <div className="mt-2 text-[11px] text-slate-300 flex justify-between">
                    <span>Health: <span className="font-mono">{health}</span></span>
                    <span>Destroyed: <span className="font-mono">{player.fortsDestroyed}</span></span>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {/* Hole Inputs */}
        {!gameOver && defender && (
          <section className="bg-slate-800/70 p-4 rounded-lg border border-slate-700 space-y-6">
            {/* Defender Scoring */}
            <div className="rounded-lg border border-emerald-600 p-4 max-w-sm bg-slate-900/80">
              <h3 className="text-sm font-semibold text-emerald-300 mb-2">
                Defender Score: {defender.name}
              </h3>
              <select
                value={holeInputs[defender.id]?.score || "bogey+"}
                onChange={(e) =>
                  updateHoleInput(defender.id, "score", e.target.value as ScoreResult)
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                disabled={mode === "elimination" && defender.eliminated}
              >
                <option value="bogey+">Bogey or Worse (+0)</option>
                <option value="par">Par (+2 repair)</option>
                <option value="birdie">Birdie (+3 repair)</option>
              </select>
            </div>

            {/* Attackers */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {players
                .filter((_, idx) => idx !== defenderIndex)
                .filter((p) => (mode === "elimination" ? !p.eliminated : true))
                .map((player) => {
                  const input = holeInputs[player.id] || {
                    fairway: false,
                    gir: false,
                    score: "bogey+" as ScoreResult,
                  };

                  return (
                    <div
                      key={player.id}
                      className="rounded-lg border border-slate-700 p-4 bg-slate-900/60 space-y-3"
                    >
                      <h3 className="text-sm font-semibold">
                        Attacker: {player.name}
                      </h3>

                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={input.fairway}
                          onChange={(e) =>
                            updateHoleInput(player.id, "fairway", e.target.checked)
                          }
                        />
                        Fairway (-1 damage)
                      </label>

                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={input.gir}
                          onChange={(e) =>
                            updateHoleInput(player.id, "gir", e.target.checked)
                          }
                        />
                        GIR (-1 damage)
                      </label>

                      <select
                        value={input.score}
                        onChange={(e) =>
                          updateHoleInput(player.id, "score", e.target.value as ScoreResult)
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs"
                      >
                        <option value="birdie">Birdie (-2)</option>
                        <option value="par">Par (-1)</option>
                        <option value="bogey+">Bogey or Worse (0)</option>
                      </select>
                    </div>
                  );
                })}
            </div>

            <div className="flex justify-end">
              <button
                onClick={applyHoleResults}
                className="px-5 py-2 bg-emerald-500 text-slate-900 font-semibold rounded-lg hover:bg-emerald-400 transition"
              >
                Apply Hole {currentHole} Results
              </button>
            </div>
          </section>
        )}

        {/* Bottom: Last Hole Summary + Battle Log */}
        {(lastSummary || history.length > 0) && (
          <section className="grid lg:grid-cols-2 gap-4 mt-6">
            {/* Last Hole Summary */}
            {lastSummary && (
              <div className="bg-slate-800/70 rounded-xl p-4 border border-slate-700 text-sm">
                <div className="flex flex-wrap justify-between gap-2 items-baseline">
                  <h2 className="font-semibold">
                    Last Hole Summary – Hole {lastSummary.hole}
                  </h2>
                  <span className="text-slate-300">
                    Defender:{" "}
                    <span className="font-semibold">{lastSummary.defenderName}</span>
                  </span>
                </div>

                <div className="grid sm:grid-cols-4 gap-3 mt-3">
                  <div>
                    <p className="text-[11px] uppercase text-slate-400">Attacker Damage</p>
                    <p className="font-mono text-slate-100">{lastSummary.attackerDamageTotal}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase text-slate-400">Defender Repair</p>
                    <p className="font-mono text-emerald-300">+{lastSummary.defenderRepair}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase text-slate-400">Net Change</p>
                    <p
                      className={
                        "font-mono " +
                        (lastSummary.netChange < 0
                          ? "text-red-300"
                          : lastSummary.netChange > 0
                          ? "text-emerald-300"
                          : "text-slate-200")
                      }
                    >
                      {formatSigned(lastSummary.netChange)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase text-slate-400">Fort Damage</p>
                    <p className="font-mono text-slate-100">
                      {lastSummary.finalDamage} / {lastSummary.maxDamage}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Battle Log */}
            <div className="bg-slate-800/70 rounded-xl p-4 border border-slate-700 text-sm">
              <div className="flex justify-between items-baseline mb-2">
                <h2 className="font-semibold">Battle Log</h2>
                <span className="text-[11px] text-slate-400">Most recent at bottom</span>
              </div>

              {history.length === 0 ? (
                <p className="text-slate-400 text-xs">No holes played yet.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {history.map((entry) => (
                    <div
                      key={`${entry.hole}-${entry.defenderName}`}
                      className="border border-slate-700/60 rounded-lg px-3 py-2 bg-slate-900/60"
                    >
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold">Hole {entry.hole}</span>
                        <span className="text-slate-300">
                          Defender: <span className="font-semibold">{entry.defenderName}</span>
                        </span>
                      </div>

                      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-slate-300">
                        <span>
                          Attacker: <span className="font-mono">{entry.attackerDamageTotal}</span>
                        </span>
                        <span>
                          Repair: <span className="font-mono text-emerald-300">+{entry.defenderRepair}</span>
                        </span>
                        <span>
                          Net:{" "}
                          <span
                            className={
                              "font-mono " +
                              (entry.netChange < 0
                                ? "text-red-300"
                                : entry.netChange > 0
                                ? "text-emerald-300"
                                : "text-slate-200")
                            }
                          >
                            {formatSigned(entry.netChange)}
                          </span>
                        </span>
                        <span>
                          Damage: <span className="font-mono">{entry.finalDamage} / {entry.maxDamage}</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default App;
