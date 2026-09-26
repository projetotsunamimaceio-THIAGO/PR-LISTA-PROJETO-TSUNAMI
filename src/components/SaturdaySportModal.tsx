import React, { useState, useMemo } from 'react';
import { 
  X, 
  Users, 
  UserPlus, 
  Search, 
  Check, 
  Trash2, 
  Shuffle, 
  Calendar, 
  CheckSquare, 
  Square, 
  Sparkles,
  UserCheck,
  Plus
} from 'lucide-react';
import type { Student, Participant, DrawResult } from '../types';
import { getSkillStars, SKILL_LEVEL_OPTIONS } from '../utils/teamBalancer';

interface ClassItem {
  id: string;
  name: string;
  description: string;
  multiplier: number;
  isOpen: boolean;
}

interface SaturdaySportModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassItem[];
  students: Student[];
  participantsByClass: (classId: string) => Participant[];
  activeDay: string;
  onSetActiveDay: (day: string) => Promise<void>;
  onAddStudentToClass: (studentId: string, classId: string) => Promise<void>;
  onAddMultipleStudentsToClass: (studentIds: string[], classId: string) => Promise<void>;
  onRemoveParticipantFromClass: (participant: Participant, classId: string) => Promise<void>;
  onAddGuestToClass: (classId: string, guestName: string, guestLevel: number) => Promise<void>;
  onUpdateParticipantLevel: (classId: string, participant: Participant, newLevel: number) => Promise<void>;
  onOpenDrawModal: (classId: string) => void;
  savedDraws: Record<string, DrawResult>;
}

export const SaturdaySportModal: React.FC<SaturdaySportModalProps> = ({
  isOpen,
  onClose,
  classes,
  students,
  participantsByClass,
  activeDay,
  onSetActiveDay,
  onAddStudentToClass,
  onAddMultipleStudentsToClass,
  onRemoveParticipantFromClass,
  onAddGuestToClass,
  onUpdateParticipantLevel,
  onOpenDrawModal,
  savedDraws
}) => {
  // Select first class by default
  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    const firstOpen = classes.find(c => c.isOpen);
    return firstOpen ? firstOpen.id : classes[0]?.id || '';
  });

  const [activeTab, setActiveTab] = useState<'students' | 'guests'>('students');
  const [studentSearch, setStudentSearch] = useState('');
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  
  // Guest addition form
  const [guestName, setGuestName] = useState('');
  const [guestLevel, setGuestLevel] = useState<number>(3);
  const [guestSuccessMsg, setGuestSuccessMsg] = useState('');
  const [batchSuccessMsg, setBatchSuccessMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Sync selectedClassId if current invalid
  const currentClass = useMemo(() => {
    return classes.find(c => c.id === selectedClassId) || classes[0];
  }, [classes, selectedClassId]);

  const currentParticipants = useMemo(() => {
    if (!currentClass) return [];
    return participantsByClass(currentClass.id);
  }, [currentClass, participantsByClass]);

  const enrolledStudentIdSet = useMemo(() => {
    return new Set(currentParticipants.filter(p => !p.isGuest).map(p => p.studentId));
  }, [currentParticipants]);

  // Filter students
  const filteredStudents = useMemo(() => {
    const query = studentSearch.toLowerCase().trim();
    return students.filter(s => {
      if (!s.isAllowed) return false;
      if (!query) return true;
      return s.name.toLowerCase().includes(query);
    });
  }, [students, studentSearch]);

  if (!isOpen) return null;

  const handleToggleStudent = async (studentId: string) => {
    if (!currentClass || isProcessing) return;
    setIsProcessing(true);
    try {
      if (enrolledStudentIdSet.has(studentId)) {
        const participant = currentParticipants.find(p => p.studentId === studentId && !p.isGuest);
        if (participant) {
          await onRemoveParticipantFromClass(participant, currentClass.id);
        }
      } else {
        await onAddStudentToClass(studentId, currentClass.id);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleSelectStudent = (studentId: string) => {
    setSelectedStudentIds(prev => 
      prev.includes(studentId) 
        ? prev.filter(id => id !== studentId) 
        : [...prev, studentId]
    );
  };

  const handleSelectAllFiltered = () => {
    const notEnrolledIds = filteredStudents
      .filter(s => !enrolledStudentIdSet.has(s.id))
      .map(s => s.id);
    setSelectedStudentIds(notEnrolledIds);
  };

  const handleClearSelection = () => {
    setSelectedStudentIds([]);
  };

  const handleBatchInsert = async () => {
    if (!currentClass || selectedStudentIds.length === 0 || isProcessing) return;
    setIsProcessing(true);
    try {
      await onAddMultipleStudentsToClass(selectedStudentIds, currentClass.id);
      setBatchSuccessMsg(`${selectedStudentIds.length} alunos inseridos com sucesso na turma!`);
      setSelectedStudentIds([]);
      setTimeout(() => setBatchSuccessMsg(''), 3000);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddGuest = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentClass || !guestName.trim() || isProcessing) return;
    
    setIsProcessing(true);
    try {
      await onAddGuestToClass(currentClass.id, guestName.trim(), guestLevel);
      setGuestSuccessMsg(`Convidado "${guestName.trim()}" inserido com sucesso!`);
      setGuestName('');
      setTimeout(() => setGuestSuccessMsg(''), 3000);
    } finally {
      setIsProcessing(false);
    }
  };

  const maxVagas = currentClass ? currentClass.multiplier * 5 : 0;
  const isFull = currentParticipants.length >= maxVagas;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-hidden">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500/15 via-sky-500/15 to-emerald-500/15 border-b border-slate-800 p-4 sm:p-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center text-2xl shadow-lg shadow-amber-500/10 shrink-0">
              ⚽
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                  ESPORTE NO SÁBADO
                </h2>
                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">
                  Inclusão Direta & Sorteio
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 max-w-2xl hidden sm:block">
                No sábado ninguém se inscreve pelo app. Escolha a turma, clique nos alunos ou inclua convidados para realizar o sorteio de linhas equilibrado.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeDay !== 'SÁBADO' && (
              <button
                type="button"
                onClick={() => onSetActiveDay('SÁBADO')}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-amber-500/20 text-amber-300 border border-slate-700 hover:border-amber-500/40 rounded-xl text-xs font-bold uppercase transition-colors"
                title="Mudar o Dia Ativo para SÁBADO"
              >
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>Ativar SÁBADO</span>
              </button>
            )}
            <button 
              onClick={onClose}
              className="w-10 h-10 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors border border-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Passo 1: Seletor de Turma */}
        <div className="bg-slate-950/70 border-b border-slate-800 px-4 sm:px-6 py-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-sky-500 text-slate-950 text-[10px] font-black flex items-center justify-center">1</span>
              Escolha a Turma / Modalidade:
            </span>
            {currentClass && (
              <span className="text-[11px] text-slate-400 font-medium">
                Vagas: <strong className="text-sky-400 font-bold">{currentParticipants.length}</strong> / {maxVagas}
              </span>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
            {classes.map(cls => {
              const isSelected = cls.id === selectedClassId;
              const pCount = participantsByClass(cls.id).length;
              const hasDraw = !!savedDraws[cls.id];
              return (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() => {
                    setSelectedClassId(cls.id);
                    setSelectedStudentIds([]);
                  }}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2.5 shrink-0 border ${
                    isSelected
                      ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.35)] scale-[1.02]'
                      : 'bg-slate-800/70 text-slate-300 border-slate-700/80 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  <span>{cls.name}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isSelected ? 'bg-slate-950 text-sky-300' : 'bg-slate-900 text-slate-400'
                  }`}>
                    {pCount} {pCount === 1 ? 'inscrito' : 'inscritos'}
                  </span>
                  {hasDraw && (
                    <span className="text-xs" title="Sorteio já realizado">🎲</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Content Area: Split 2 Columns */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
          
          {/* Left Column: Inclusion Controls (Students or Guests) */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            
            {/* Tabs for Inclusion */}
            <div className="flex items-center gap-2 bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('students')}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                  activeTab === 'students'
                    ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Incluir Alunos ({students.filter(s => s.isAllowed).length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('guests')}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                  activeTab === 'guests'
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                <span>Incluir Convidado</span>
              </button>
            </div>

            {/* TAB 1: INCLUIR ALUNOS */}
            {activeTab === 'students' && (
              <div className="flex-1 flex flex-col space-y-3 min-h-0">
                
                {/* Search & Multi-select Mode Controls */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Pesquisar aluno por nome..."
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-10 pr-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
                    />
                    {studentSearch && (
                      <button 
                        type="button" 
                        onClick={() => setStudentSearch('')} 
                        className="absolute right-3 top-2.5 text-slate-500 hover:text-white text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setMultiSelectMode(!multiSelectMode);
                      setSelectedStudentIds([]);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shrink-0 border ${
                      multiSelectMode
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {multiSelectMode ? <CheckSquare className="w-3.5 h-3.5 text-amber-400" /> : <Square className="w-3.5 h-3.5 text-slate-400" />}
                    <span>{multiSelectMode ? 'Modo Vários Ativo' : 'Selecionar Vários'}</span>
                  </button>
                </div>

                {/* Multi-select Actions Bar (When Multi-Select is Active) */}
                {multiSelectMode && (
                  <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0 animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                        {selectedStudentIds.length} selecionados
                      </span>
                      <button
                        type="button"
                        onClick={handleSelectAllFiltered}
                        className="text-[11px] font-bold text-sky-400 hover:underline px-2 py-0.5"
                      >
                        Selecionar todos não inscritos ({filteredStudents.filter(s => !enrolledStudentIdSet.has(s.id)).length})
                      </button>
                      {selectedStudentIds.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearSelection}
                          className="text-[11px] font-bold text-slate-400 hover:text-white px-2 py-0.5"
                        >
                          Limpar
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={handleBatchInsert}
                      disabled={selectedStudentIds.length === 0 || isProcessing}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Inserir ({selectedStudentIds.length}) na Turma</span>
                    </button>
                  </div>
                )}

                {/* Success Message Banner */}
                {batchSuccessMsg && (
                  <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shrink-0 animate-in fade-in">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>{batchSuccessMsg}</span>
                  </div>
                )}

                {/* Instruction note */}
                <p className="text-[11px] text-slate-400 shrink-0">
                  {multiSelectMode 
                    ? 'Marque os alunos que deseja incluir e clique em "Inserir na Turma".' 
                    : 'Clique diretamente em qualquer aluno para inseri-lo ou retirá-lo da turma.'}
                </p>

                {/* Students List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2 max-h-[350px]">
                  {filteredStudents.length === 0 ? (
                    <div className="text-center py-10 bg-slate-950/40 rounded-2xl border border-slate-800/60 p-4">
                      <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">
                        Nenhum aluno encontrado para "{studentSearch}"
                      </p>
                    </div>
                  ) : (
                    filteredStudents.map(student => {
                      const isEnrolled = enrolledStudentIdSet.has(student.id);
                      const isSelectedInMulti = selectedStudentIds.includes(student.id);
                      const studentLevel = student.skillLevel || 3;

                      return (
                        <div
                          key={student.id}
                          onClick={() => {
                            if (multiSelectMode) {
                              if (!isEnrolled) handleToggleSelectStudent(student.id);
                            } else {
                              handleToggleStudent(student.id);
                            }
                          }}
                          className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                            isEnrolled
                              ? 'bg-emerald-950/20 border-emerald-500/40 hover:bg-emerald-950/30 shadow-sm'
                              : isSelectedInMulti
                                ? 'bg-amber-500/15 border-amber-500/50 shadow-sm'
                                : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {multiSelectMode ? (
                              <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelectedInMulti}
                                  disabled={isEnrolled}
                                  onChange={() => handleToggleSelectStudent(student.id)}
                                  className="w-4 h-4 rounded text-sky-500 focus:ring-sky-500 bg-slate-900 border-slate-700 cursor-pointer disabled:opacity-40"
                                />
                              </div>
                            ) : (
                              <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                                isEnrolled 
                                  ? 'bg-emerald-500 text-slate-950' 
                                  : 'bg-slate-800 text-slate-400'
                              }`}>
                                {isEnrolled ? <Check className="w-4 h-4 stroke-[3]" /> : <UserCheck className="w-3.5 h-3.5" />}
                              </div>
                            )}

                            <div className="truncate">
                              <span className={`text-xs sm:text-sm font-black uppercase tracking-tight block truncate ${
                                isEnrolled ? 'text-emerald-300' : 'text-slate-200'
                              }`}>
                                {student.name}
                              </span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] font-mono text-amber-300 font-bold">
                                  {getSkillStars(studentLevel)} ({studentLevel}★)
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-2">
                            {isEnrolled ? (
                              <div className="flex items-center gap-1.5">
                                <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase px-2.5 py-1 rounded-xl">
                                  ✓ Na Turma
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleStudent(student.id);
                                  }}
                                  className="p-1.5 rounded-lg bg-rose-950/40 text-rose-400 hover:bg-rose-900 hover:text-white transition-colors"
                                  title="Remover da turma"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (multiSelectMode) {
                                    handleToggleSelectStudent(student.id);
                                  } else {
                                    handleToggleStudent(student.id);
                                  }
                                }}
                                className="px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500 text-sky-300 hover:text-slate-950 border border-sky-500/30 hover:border-sky-400 text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Inserir</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: INCLUIR CONVIDADO */}
            {activeTab === 'guests' && (
              <div className="bg-slate-950/70 border border-amber-500/30 rounded-3xl p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">⭐</span>
                    <div>
                      <h3 className="text-sm font-black uppercase text-amber-300 tracking-wide">
                        Adicionar Convidado na Turma {currentClass?.name}
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        O admin coloca o nome e nível do convidado para participar do sorteio de linhas.
                      </p>
                    </div>
                  </div>
                </div>

                {guestSuccessMsg && (
                  <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>{guestSuccessMsg}</span>
                  </div>
                )}

                <form onSubmit={handleAddGuest} className="space-y-4">
                  <div>
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-300 block mb-1.5">
                      Nome do Convidado:
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Carlos Convidado, Juliana Silva..."
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      maxLength={50}
                      autoFocus
                      className="w-full bg-slate-900 border border-slate-700/80 rounded-2xl px-4 py-3 text-sm text-white uppercase placeholder:normal-case placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-300 block mb-1.5">
                      Nível de Jogo do Convidado (para o Sorteio Equilibrado):
                    </label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {SKILL_LEVEL_OPTIONS.map(opt => (
                        <button
                          key={opt.level}
                          type="button"
                          onClick={() => setGuestLevel(opt.level)}
                          className={`p-2 rounded-xl text-center border transition-all flex flex-col items-center justify-center gap-1 ${
                            guestLevel === opt.level
                              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20 scale-[1.02]'
                              : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-850'
                          }`}
                        >
                          <span className="text-xs">{opt.stars}</span>
                          <span className="text-[10px] font-bold uppercase truncate w-full">
                            {opt.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={!guestName.trim() || isProcessing}
                    className="w-full py-3.5 px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Incluir Convidado na Turma</span>
                  </button>
                </form>

                <div className="bg-slate-900/60 p-3 rounded-2xl border border-slate-800/80 text-[11px] text-slate-400 leading-relaxed">
                  💡 <strong className="text-white">Dica:</strong> Convidados aparecerão na lista oficial identificados com destaque dourado e serão incluídos automaticamente na formação dos times durante o sorteio de linhas.
                </div>
              </div>
            )}

          </div>

          {/* Right Column: Live Roster & Draw Launcher */}
          <div className="lg:col-span-5 flex flex-col space-y-4">
            
            <div className="bg-slate-950/70 border border-slate-800 rounded-3xl p-5 flex flex-col h-full shadow-lg">
              
              {/* Roster Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                    Escalação de Sábado:
                  </span>
                  <h3 className="text-base font-black uppercase text-white tracking-tight flex items-center gap-2">
                    {currentClass?.name}
                  </h3>
                </div>

                <div className="text-right">
                  <span className={`text-xs font-black px-2.5 py-1 rounded-xl border ${
                    isFull 
                      ? 'bg-rose-500/15 border-rose-500/30 text-rose-300' 
                      : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  }`}>
                    {currentParticipants.length} inscritos
                  </span>
                </div>
              </div>

              {/* Draw Action Highlight */}
              <div className="py-3 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (currentClass) onOpenDrawModal(currentClass.id);
                  }}
                  disabled={currentParticipants.length < 4}
                  className={`w-full py-3 px-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-md ${
                    currentParticipants.length >= 4
                      ? 'bg-gradient-to-r from-sky-500 via-emerald-500 to-teal-400 text-slate-950 hover:brightness-110 shadow-sky-500/20 active:scale-[0.99] cursor-pointer'
                      : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed'
                  }`}
                >
                  <Shuffle className="w-4 h-4" />
                  <span>
                    {savedDraws[currentClass?.id || ''] 
                      ? `Ver Times Sorteados (${savedDraws[currentClass?.id || ''].teams.length} times)` 
                      : 'Sortear Linhas Desta Turma ⚖️'}
                  </span>
                </button>
                {currentParticipants.length < 4 ? (
                  <p className="text-[10px] text-slate-500 text-center mt-1.5">
                    Mínimo de 4 participantes para realizar o sorteio de linhas.
                  </p>
                ) : (
                  <p className="text-[10px] text-sky-300 text-center mt-1.5">
                    {Math.floor(currentParticipants.length / 5)} times de 5 {currentParticipants.length % 5 > 0 ? `+ ${currentParticipants.length % 5} na espera` : ''}
                  </p>
                )}
              </div>

              {/* Participants Roster List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2 min-h-[220px] max-h-[380px]">
                {currentParticipants.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
                    <Sparkles className="w-8 h-8 text-slate-600 mb-2" />
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Nenhum participante na turma ainda.
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                      Clique nos alunos à esquerda ou insira convidados para montar o esporte de sábado.
                    </p>
                  </div>
                ) : (
                  currentParticipants.map((p, idx) => (
                    <div
                      key={p.key}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                        p.isGuest
                          ? 'bg-amber-950/20 border-amber-500/40'
                          : 'bg-slate-900/80 border-slate-800/80'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-5 h-5 rounded-lg text-[10px] font-black flex items-center justify-center shrink-0 ${
                          p.isGuest ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {idx + 1}
                        </span>

                        <div className="truncate">
                          <span className={`text-xs font-black uppercase tracking-tight block truncate ${
                            p.isGuest ? 'text-amber-300' : 'text-slate-200'
                          }`}>
                            {p.name}
                          </span>
                          <span className="text-[9px] uppercase font-bold text-slate-400 block truncate">
                            {p.isGuest ? (p.guestOf ? `Convidado de ${p.guestOf}` : 'Convidado') : 'Aluno Oficial'}
                          </span>
                        </div>
                      </div>

                      {/* Stars and Remove Action */}
                      <div className="flex items-center gap-2 shrink-0">
                        {/* 1-click star adjustment */}
                        <div className="flex items-center gap-0.5 bg-slate-950 px-1.5 py-0.5 rounded-lg border border-slate-800">
                          {([1, 2, 3, 4, 5] as const).map(starNum => (
                            <button
                              key={starNum}
                              type="button"
                              onClick={() => {
                                if (currentClass) onUpdateParticipantLevel(currentClass.id, p, starNum);
                              }}
                              className={`text-[10px] leading-none transition-transform hover:scale-125 ${
                                starNum <= p.level 
                                  ? 'opacity-100 drop-shadow-[0_0_2px_rgba(250,204,21,0.6)]' 
                                  : 'opacity-20 hover:opacity-70 grayscale'
                              }`}
                              title={`Definir nível ${starNum} estrelas`}
                            >
                              ⭐
                            </button>
                          ))}
                        </div>

                        {/* Remove participant */}
                        <button
                          type="button"
                          onClick={() => {
                            if (currentClass) onRemoveParticipantFromClass(p, currentClass.id);
                          }}
                          className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                          title="Remover desta turma"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Roster Footer */}
              {currentParticipants.length > 0 && (
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
                  <span>
                    Alunos: <strong className="text-white">{currentParticipants.filter(p => !p.isGuest).length}</strong> • Convidados: <strong className="text-amber-300">{currentParticipants.filter(p => p.isGuest).length}</strong>
                  </span>
                  <span className="font-mono text-sky-300 font-bold">
                    Média: {(currentParticipants.reduce((sum, p) => sum + p.level, 0) / currentParticipants.length).toFixed(1)} ⭐
                  </span>
                </div>
              )}

            </div>

          </div>

        </div>

        {/* Modal Bottom Bar */}
        <div className="bg-slate-950/90 border-t border-slate-800 px-4 sm:px-6 py-3 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-400">
            Todas as alterações são sincronizadas automaticamente com o Firebase.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wider rounded-xl transition-colors"
          >
            Concluir / Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
