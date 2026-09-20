import React, { useState, useEffect } from 'react';
import { 
  X, 
  Shuffle, 
  Copy, 
  Check, 
  Users, 
  Scale, 
  Clock, 
  RotateCcw, 
  Save, 
  ArrowLeftRight,
  ShieldCheck
} from 'lucide-react';
import { Participant, DrawResult } from '../types';
import { generateBalancedTeams, formatDrawForWhatsApp, getSkillStars } from '../utils/teamBalancer';

interface TeamDrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  classId: string;
  className: string;
  participants: Participant[];
  savedDraw?: DrawResult | null;
  onSaveDraw?: (draw: DrawResult) => Promise<void>;
}

export const TeamDrawModal: React.FC<TeamDrawModalProps> = ({
  isOpen,
  onClose,
  classId,
  className,
  participants,
  savedDraw,
  onSaveDraw
}) => {
  const [teamSize, setTeamSize] = useState<4 | 5 | 6>(5);
  const [currentDraw, setCurrentDraw] = useState<DrawResult | null>(savedDraw || null);
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [selectedPlayerForSwap, setSelectedPlayerForSwap] = useState<{ teamId: number; playerKey: string } | null>(null);

  // When savedDraw updates or modal opens, sync
  useEffect(() => {
    if (savedDraw) {
      setCurrentDraw(savedDraw);
      setTeamSize(savedDraw.teamSize as (4 | 5 | 6));
    }
  }, [savedDraw]);

  if (!isOpen) return null;

  const totalParticipants = participants.length;
  const potentialTeams = Math.floor(totalParticipants / teamSize);
  const potentialWaitlist = totalParticipants % teamSize;

  const handleDraw = () => {
    setSelectedPlayerForSwap(null);
    const result = generateBalancedTeams(participants, teamSize, classId, className);
    setCurrentDraw(result);
    setSavedSuccess(false);
  };

  const handleCopyWhatsApp = async () => {
    if (!currentDraw) return;
    const text = formatDrawForWhatsApp(currentDraw);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error('Falha ao copiar', e);
    }
  };

  const handleSave = async () => {
    if (!currentDraw || !onSaveDraw) return;
    setIsSaving(true);
    try {
      await onSaveDraw(currentDraw);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (e) {
      console.error('Erro ao salvar sorteio', e);
    } finally {
      setIsSaving(false);
    }
  };

  // Manual player swap between teams
  const handlePlayerClick = (teamId: number, playerKey: string) => {
    if (!currentDraw) return;

    if (!selectedPlayerForSwap) {
      setSelectedPlayerForSwap({ teamId, playerKey });
    } else {
      if (selectedPlayerForSwap.teamId === teamId && selectedPlayerForSwap.playerKey === playerKey) {
        // Deselect
        setSelectedPlayerForSwap(null);
        return;
      }

      // Perform swap between selectedPlayerForSwap and clicked player
      const teamA = currentDraw.teams.find(t => t.id === selectedPlayerForSwap.teamId);
      const teamB = currentDraw.teams.find(t => t.id === teamId);

      if (teamA && teamB) {
        const pAIdx = teamA.players.findIndex(p => p.key === selectedPlayerForSwap.playerKey);
        const pBIdx = teamB.players.findIndex(p => p.key === playerKey);

        if (pAIdx !== -1 && pBIdx !== -1) {
          const pA = teamA.players[pAIdx];
          const pB = teamB.players[pBIdx];

          const updatedTeams = currentDraw.teams.map(t => {
            if (t.id === teamA.id && t.id === teamB.id) {
              const newPlayers = [...t.players];
              newPlayers[pAIdx] = pB;
              newPlayers[pBIdx] = pA;
              return { ...t, players: newPlayers };
            }
            if (t.id === teamA.id) {
              const newPlayers = [...t.players];
              newPlayers[pAIdx] = pB;
              const totalStars = newPlayers.reduce((acc, p) => acc + (p.level || 3), 0);
              return {
                ...t,
                players: newPlayers,
                totalStars,
                averageStars: Number((totalStars / newPlayers.length).toFixed(1))
              };
            }
            if (t.id === teamB.id) {
              const newPlayers = [...t.players];
              newPlayers[pBIdx] = pA;
              const totalStars = newPlayers.reduce((acc, p) => acc + (p.level || 3), 0);
              return {
                ...t,
                players: newPlayers,
                totalStars,
                averageStars: Number((totalStars / newPlayers.length).toFixed(1))
              };
            }
            return t;
          });

          setCurrentDraw({
            ...currentDraw,
            teams: updatedTeams
          });
          setSavedSuccess(false);
        }
      }
      setSelectedPlayerForSwap(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-3xl p-5 sm:p-7 shadow-2xl shadow-sky-950/20 my-auto flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Shuffle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black tracking-widest uppercase text-sky-400">
                  Sorteador de Linhas & Times
                </span>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-bold">
                  {totalParticipants} {totalParticipants === 1 ? 'inscrito' : 'inscritos'}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                {className}
              </h2>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-6">

          {/* Controls Bar: Option 4, 5, 6 players */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-300 block mb-1.5 flex items-center gap-2">
                  <Users className="w-4 h-4 text-sky-400" />
                  Jogadores por Linha / Time:
                </label>
                <p className="text-[11px] text-slate-400">
                  Prefere jogar com 4, 5 ou 6 pessoas em cada time?
                </p>
              </div>

              {/* Selector for 4, 5, 6 */}
              <div className="flex items-center gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 shrink-0">
                {([4, 5, 6] as const).map(num => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      setTeamSize(num);
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                      teamSize === num
                        ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20 scale-[1.02]'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <span>{num}</span>
                    <span className="text-[10px] font-bold">jogadores</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Projection Summary Card */}
            <div className="mt-4 pt-4 border-t border-slate-800/60 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800/60 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-black">
                  {potentialTeams}
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Times completos</span>
                  <span className="font-black text-slate-200">
                    {potentialTeams > 0 ? `${potentialTeams} ${potentialTeams === 1 ? 'time' : 'times'} de ${teamSize}` : 'Nenhum time completo'}
                  </span>
                </div>
              </div>

              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800/60 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center font-black ${
                  potentialWaitlist > 0 
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' 
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}>
                  {potentialWaitlist}
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Espera de linha</span>
                  <span className="font-black text-slate-200">
                    {potentialWaitlist > 0 
                      ? `${potentialWaitlist} ${potentialWaitlist === 1 ? 'pessoa' : 'pessoas'}` 
                      : 'Ninguém na espera'}
                  </span>
                </div>
              </div>

              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800/60 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center font-black">
                  <Scale className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Balanceamento</span>
                  <span className="font-black text-slate-200">
                    Mix automático ⭐
                  </span>
                </div>
              </div>
            </div>

            {/* Notification explaining registration priority rule */}
            <div className="mt-3 flex items-start gap-2 text-[11px] text-slate-400 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/40">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong className="text-emerald-300">Regra de Preferência:</strong> Os primeiros inscritos na ordem cronológica garantem vaga nas linhas titulares ({potentialTeams * teamSize} primeiros). O restante fica na fila de espera de linha.
              </span>
            </div>
          </div>

          {/* Action to draw */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleDraw}
              disabled={totalParticipants < 4}
              className="w-full sm:w-auto bg-gradient-to-r from-sky-500 via-sky-400 to-emerald-400 hover:from-sky-400 hover:to-emerald-300 disabled:opacity-50 text-slate-950 font-black text-sm uppercase tracking-wider py-3.5 px-7 rounded-2xl flex items-center justify-center gap-2.5 transition-all shadow-[0_4px_16px_rgba(14,165,233,0.3)] hover:-translate-y-0.5 active:translate-y-0"
            >
              <Shuffle className="w-5 h-5" />
              {currentDraw ? 'Sortear Novamente (Reembaralhar)' : 'Sortear Times Equilibrados'}
            </button>

            {currentDraw && (
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={handleCopyWhatsApp}
                  className={`flex-1 sm:flex-none px-4 py-3 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all border ${
                    copied 
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                  title="Copiar lista dos times para enviar no WhatsApp"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Copiado p/ WhatsApp!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar WhatsApp</span>
                    </>
                  )}
                </button>

                {onSaveDraw && (
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`flex-1 sm:flex-none px-4 py-3 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all border ${
                      savedSuccess 
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md' 
                        : 'bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black border-emerald-500'
                    }`}
                  >
                    {isSaving ? (
                      <span className="flex items-center gap-1.5">
                        <RotateCcw className="w-4 h-4 animate-spin" /> Salvando...
                      </span>
                    ) : savedSuccess ? (
                      <span className="flex items-center gap-1.5">
                        <Check className="w-4 h-4" /> Salvo!
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <Save className="w-4 h-4" /> Salvar Sorteio
                      </span>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Results Display */}
          {currentDraw ? (
            <div className="space-y-6">
              
              {/* Swap hint if organizer wants manual tweak */}
              <div className="flex items-center justify-between bg-slate-950/40 border border-slate-800 p-2.5 rounded-xl text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5">
                  <ArrowLeftRight className="w-3.5 h-3.5 text-sky-400" />
                  <span>Dica: para trocar jogadores de time manualmente, clique em um e depois no outro.</span>
                </span>
                {selectedPlayerForSwap && (
                  <span className="text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    1 jogador selecionado... clique no outro para trocar!
                  </span>
                )}
              </div>

              {/* Teams Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {currentDraw.teams.map((team, tIdx) => {
                  const emojis = ['🟢', '🔵', '🟡', '🟣', '🔴', '🟠'];
                  const emoji = emojis[tIdx % emojis.length];

                  return (
                    <div 
                      key={team.id}
                      className="bg-slate-950/70 border border-slate-800 rounded-2xl overflow-hidden shadow-lg flex flex-col"
                    >
                      {/* Team Header */}
                      <div className="bg-slate-850 p-3.5 border-b border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{emoji}</span>
                          <h4 className="font-black text-sm uppercase text-white tracking-wide">
                            {team.name}
                          </h4>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold bg-slate-800 px-2 py-0.5 rounded text-sky-300 border border-slate-700 font-mono">
                            Média: {team.averageStars} ⭐
                          </span>
                        </div>
                      </div>

                      {/* Players List */}
                      <div className="p-3 space-y-2 flex-1">
                        {team.players.map((player, pIdx) => {
                          const isSelectedForSwap = selectedPlayerForSwap?.teamId === team.id && selectedPlayerForSwap?.playerKey === player.key;

                          return (
                            <button
                              key={player.key}
                              type="button"
                              onClick={() => handlePlayerClick(team.id, player.key)}
                              className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                                isSelectedForSwap
                                  ? 'bg-amber-500/20 border-amber-400 text-amber-200 scale-[1.02] shadow-md shadow-amber-500/10'
                                  : 'bg-slate-900/80 hover:bg-slate-850 border-slate-800/80 text-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="w-5 h-5 rounded-lg bg-slate-800 text-slate-400 text-[10px] font-black flex items-center justify-center shrink-0">
                                  {pIdx + 1}
                                </span>
                                <div className="truncate">
                                  <span className="text-xs font-black uppercase tracking-tight block truncate">
                                    {player.name}
                                  </span>
                                  {player.isGuest && (
                                    <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wide block truncate">
                                      Convidado de {player.guestOf}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="shrink-0">
                                <span className="text-[11px] font-mono tracking-tighter text-sky-300">
                                  {getSkillStars(player.level)}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Team Footer */}
                      <div className="p-2.5 bg-slate-950/90 border-t border-slate-850 flex justify-between items-center text-[10px] text-slate-400">
                        <span>Total: {team.totalStars} estrelas</span>
                        <span className="text-emerald-400 font-bold">{team.players.length} jogadores</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Waitlist / Espera de Linha Card */}
              {currentDraw.waitlist.length > 0 && (
                <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-4 shadow-md">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <h4 className="text-xs font-black uppercase text-amber-300 tracking-wider">
                        Espera de Linha ({currentDraw.waitlist.length} {currentDraw.waitlist.length === 1 ? 'jogador' : 'jogadores'})
                      </h4>
                    </div>
                    <span className="text-[10px] text-amber-400/80 font-bold uppercase">
                      Próximos para o rodízio
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {currentDraw.waitlist.map((player, idx) => (
                      <div
                        key={player.key}
                        className="bg-slate-900/90 border border-amber-500/20 p-2.5 rounded-xl flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-lg bg-amber-500/20 text-amber-300 text-[10px] font-black flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div className="truncate">
                            <span className="text-xs font-black uppercase text-slate-200 tracking-tight block truncate">
                              {player.name}
                            </span>
                            {player.isGuest && (
                              <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wide block truncate">
                                Convidado de {player.guestOf}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-[11px] font-mono tracking-tighter text-amber-300 shrink-0">
                          {getSkillStars(player.level)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="py-12 px-4 text-center bg-slate-950/40 rounded-3xl border border-dashed border-slate-800 flex flex-col items-center justify-center">
              <Shuffle className="w-10 h-10 text-slate-600 mb-3" />
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 mb-1">
                Nenhum sorteio realizado ainda
              </h3>
              <p className="text-xs text-slate-500 max-w-md mb-5">
                Escolha a quantidade de jogadores por time (4, 5 ou 6) e clique no botão acima para montar as linhas perfeitamente equilibradas.
              </p>
              <button
                type="button"
                onClick={handleDraw}
                disabled={totalParticipants < 4}
                className="bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 font-black text-xs uppercase tracking-widest py-3 px-6 rounded-xl transition-all shadow-md shadow-sky-500/20"
              >
                Gerar Primeiro Sorteio
              </button>
            </div>
          )}

        </div>

        {/* Footer info */}
        <div className="pt-4 border-t border-slate-800 shrink-0 flex items-center justify-between text-[11px] text-slate-500">
          <span>Tsunami Esportes • Divisão Inteligente de Nível</span>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white font-bold uppercase tracking-wider text-xs"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
