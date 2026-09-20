import { Participant, Team, DrawResult } from '../types';

export const TEAM_COLORS = [
  'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 text-emerald-400',
  'from-sky-500/20 to-sky-600/10 border-sky-500/30 text-sky-400',
  'from-amber-500/20 to-amber-600/10 border-amber-500/30 text-amber-400',
  'from-purple-500/20 to-purple-600/10 border-purple-500/30 text-purple-400',
  'from-rose-500/20 to-rose-600/10 border-rose-500/30 text-rose-400',
  'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30 text-cyan-400',
  'from-indigo-500/20 to-indigo-600/10 border-indigo-500/30 text-indigo-400',
  'from-teal-500/20 to-teal-600/10 border-teal-500/30 text-teal-400',
];

export function getSkillStars(level?: number): string {
  const count = level && level >= 1 && level <= 5 ? level : 3;
  return '⭐'.repeat(count);
}

// Fisher-Yates shuffle with true randomness
function shuffle<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Balanced Team Draw Algorithm
 * 
 * 1. Prioritizes the first registered participants up to the number needed for complete teams.
 * 2. Excess players are assigned to the "Espera de Linha" (bench / queue).
 * 3. Distributes players by skill level (descending) using a greedy capacity-constrained
 *    balancer to spread high-rated players (⭐⭐⭐⭐⭐) evenly across all teams.
 * 4. Applies a local search (2-opt swap) to further minimize star variance between teams.
 */
export function generateBalancedTeams(
  participants: Participant[],
  teamSize: 4 | 5 | 6,
  classId: string,
  className: string
): DrawResult {
  // Ensure we respect registration priority (already ordered by enrollment time)
  const totalCount = participants.length;
  const numTeams = Math.floor(totalCount / teamSize);

  if (numTeams === 0) {
    return {
      classId,
      className,
      teamSize,
      teams: [],
      waitlist: [...participants],
      createdAt: Date.now(),
      totalPlayers: totalCount
    };
  }

  const startersCount = numTeams * teamSize;
  const starters = participants.slice(0, startersCount);
  const waitlist = participants.slice(startersCount);

  // Group starters by level and shuffle each group for fair randomization across draws
  const levelGroups: Record<number, Participant[]> = { 5: [], 4: [], 3: [], 2: [], 1: [] };
  for (const p of starters) {
    const lvl = Math.min(5, Math.max(1, p.level || 3));
    levelGroups[lvl].push(p);
  }

  // Shuffle within the same star rating
  const sortedStarters: Participant[] = [];
  for (let lvl = 5; lvl >= 1; lvl--) {
    sortedStarters.push(...shuffle(levelGroups[lvl]));
  }

  // Initialize empty teams
  const teams: Team[] = Array.from({ length: numTeams }, (_, idx) => ({
    id: idx + 1,
    name: `Linha / Time ${idx + 1}`,
    players: [],
    totalStars: 0,
    averageStars: 0,
    color: TEAM_COLORS[idx % TEAM_COLORS.length]
  }));

  // Distribute players: Greedy balanced placement
  // High-star players (5, 4, 3...) go to the team with lowest star sum that still has open spots
  for (const player of sortedStarters) {
    const candidateTeams = teams.filter(t => t.players.length < teamSize);
    if (candidateTeams.length === 0) break;

    // Find the min total stars among candidate teams
    const minStars = Math.min(...candidateTeams.map(t => t.totalStars));
    const bestTeams = candidateTeams.filter(t => t.totalStars === minStars);
    // Pick randomly among best teams to avoid systematic bias
    const chosenTeam = bestTeams[Math.floor(Math.random() * bestTeams.length)];

    chosenTeam.players.push(player);
    chosenTeam.totalStars += player.level || 3;
  }

  // Refinement step: 2-opt swap to minimize variance of totalStars across teams
  // We check if swapping any player A from team 1 with player B from team 2 reduces the difference
  let improved = true;
  let iterations = 0;
  while (improved && iterations < 30) {
    improved = false;
    iterations++;

    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const teamA = teams[i];
        const teamB = teams[j];
        const currentDiff = Math.abs(teamA.totalStars - teamB.totalStars);

        if (currentDiff <= 1) continue; // Already maximally balanced

        for (let pA = 0; pA < teamA.players.length; pA++) {
          for (let pB = 0; pB < teamB.players.length; pB++) {
            const playerA = teamA.players[pA];
            const playerB = teamB.players[pB];

            const newTotalA = teamA.totalStars - playerA.level + playerB.level;
            const newTotalB = teamB.totalStars - playerB.level + playerA.level;
            const newDiff = Math.abs(newTotalA - newTotalB);

            if (newDiff < currentDiff) {
              // Perform swap
              teamA.players[pA] = playerB;
              teamB.players[pB] = playerA;
              teamA.totalStars = newTotalA;
              teamB.totalStars = newTotalB;
              improved = true;
              break;
            }
          }
          if (improved) break;
        }
      }
    }
  }

  // Calculate averages
  for (const team of teams) {
    team.averageStars = team.players.length > 0 
      ? Number((team.totalStars / team.players.length).toFixed(1)) 
      : 0;
  }

  return {
    classId,
    className,
    teamSize,
    teams,
    waitlist,
    createdAt: Date.now(),
    totalPlayers: totalCount
  };
}

/**
 * Formats the draw result into a clean, ready-to-share WhatsApp message
 */
export function formatDrawForWhatsApp(draw: DrawResult): string {
  const dateStr = new Date(draw.createdAt).toLocaleDateString('pt-BR');
  const timeStr = new Date(draw.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  let msg = `🌊 *PROJETO TSUNAMI - LINHAS / TIMES SORTEADOS*\n`;
  msg += `📍 *Modalidade:* ${draw.className.toUpperCase()}\n`;
  msg += `👥 *Formato:* ${draw.teamSize} jogadores por time (${draw.teams.length} ${draw.teams.length === 1 ? 'time' : 'times'})\n`;
  msg += `📅 *Sorteio realizado:* ${dateStr} às ${timeStr}\n\n`;

  draw.teams.forEach((team, tIdx) => {
    const emojis = ['🟢', '🔵', '🟡', '🟣', '🔴', '🟠', '⚪', '⚫'];
    const emoji = emojis[tIdx % emojis.length];
    msg += `${emoji} *TIME ${tIdx + 1}* (Média: ${team.averageStars} ⭐ | Total: ${team.totalStars} pts)\n`;
    team.players.forEach((p, pIdx) => {
      const guestText = p.isGuest ? ` _(Convidado de ${p.guestOf})_` : '';
      msg += `  ${pIdx + 1}. ${p.name} ${getSkillStars(p.level)}${guestText}\n`;
    });
    msg += `\n`;
  });

  if (draw.waitlist.length > 0) {
    msg += `⏳ *ESPERA DE LINHA (${draw.waitlist.length} ${draw.waitlist.length === 1 ? 'jogador' : 'jogadores'}):*\n`;
    draw.waitlist.forEach((p, idx) => {
      const guestText = p.isGuest ? ` _(Convidado de ${p.guestOf})_` : '';
      msg += `  ${idx + 1}. ${p.name} ${getSkillStars(p.level)}${guestText}\n`;
    });
    msg += `\n_Os jogadores da espera de linha entram conforme o rodízio ou desistências._\n`;
  }

  msg += `\n⚡ *Tsunami Esportes - Jogos Equilibrados*`;
  return msg;
}
