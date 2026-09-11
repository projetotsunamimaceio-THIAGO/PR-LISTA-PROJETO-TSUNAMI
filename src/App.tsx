import { useState, useEffect } from "react";
import { LogIn, Lock, ArrowLeft, Plus, Trash2, LogOut, RefreshCw, Search, X, Check, ShieldAlert } from "lucide-react";
import { doc, setDoc, getDocs, deleteDoc, onSnapshot, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./lib/firebase";
import { motion, AnimatePresence } from "framer-motion";

type ClassDay = 'TERÇA' | 'SEXTA' | 'SÁBADO';

interface ClassItem {
  id: string;
  name: string;
  description: string;
  multiplier: number; // 1 to 8 (each represents 5 vagas)
  isOpen: boolean;
}

interface Student {
  id: string;
  name: string;
  password?: string;
  isAllowed: boolean;
}

interface EnrollmentRecord {
  studentId: string;
  classes: string[];
  updatedAt: number;
  justifiedAbsence?: boolean;
  absenceReason?: string;
}

export default function App() {
  const [view, setView] = useState<'home' | 'adminLogin' | 'adminPanel' | 'studentFlow'>('home');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Admin state
  const [activeDay, setActiveDay] = useState<ClassDay>('SEXTA');
  const [notice, setNotice] = useState('Turmas abertas. Faça sua\ninscrição!!');
  
  // Classes
  const [classes, setClasses] = useState<ClassItem[]>([
    {
      id: '1',
      name: 'ALTINHA',
      description: 'horário a definir... quinta até 12h',
      multiplier: 2, // 10 vagas
      isOpen: true,
    },
    {
      id: '2',
      name: 'AQUECIMENTO VOLEIBOL',
      description: 'horário a definir... quinta até 12h',
      multiplier: 1, // 5 vagas
      isOpen: false,
    },
    {
      id: '3',
      name: 'FUTSAL FEMININO',
      description: 'horário a definir... quinta até 12h',
      multiplier: 2, // 10 vagas
      isOpen: true,
    }
  ]);

  // Students & Sync
  const [students, setStudents] = useState<Student[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

  // Enrollments (Firebase)
  const [enrollments, setEnrollments] = useState<EnrollmentRecord[]>([]);
  const [enrollmentsLocked, setEnrollmentsLocked] = useState(false);
  const [absenceJustificationOpen, setAbsenceJustificationOpen] = useState(false);

  // Student Flow State
  const [studentStep, setStudentStep] = useState<1 | 2 | 3>(1);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentPasswordInput, setStudentPasswordInput] = useState('');
  const [studentSearchInput, setStudentSearchInput] = useState('');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [isAbsenceJustified, setIsAbsenceJustified] = useState(false);
  const [absenceReason, setAbsenceReason] = useState('');
  const [studentFlowError, setStudentFlowError] = useState('');

  // Config Subscription (Firebase)
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "config", "settings"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.students) setStudents(data.students);
        if (data.classes) setClasses(data.classes);
        if (data.enrollmentsLocked !== undefined) setEnrollmentsLocked(data.enrollmentsLocked);
        if (data.absenceJustificationOpen !== undefined) setAbsenceJustificationOpen(data.absenceJustificationOpen);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "enrollments"), (snapshot) => {
      const newEnrollments: EnrollmentRecord[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        newEnrollments.push({
          studentId: doc.id,
          classes: data.classes || [],
          updatedAt: data.updatedAt?.toMillis?.() || Date.now(),
          justifiedAbsence: data.justifiedAbsence || false,
          absenceReason: data.absenceReason || '',
        });
      });
      setEnrollments(newEnrollments);
    });
    return () => unsubscribe();
  }, []);

  const saveConfig = async (newStudents: Student[], newClasses: ClassItem[]) => {
    try {
      await setDoc(doc(db, "config", "settings"), {
        students: newStudents,
        classes: newClasses,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.error("Erro ao salvar config no Firebase", e);
    }
  };

  const toggleEnrollmentsLocked = async () => {
    try {
      await setDoc(doc(db, "config", "settings"), {
        enrollmentsLocked: !enrollmentsLocked,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.error("Erro ao alternar trancamento das inscrições", e);
    }
  };

  const toggleAbsenceJustification = async () => {
    try {
      await setDoc(doc(db, "config", "settings"), {
        absenceJustificationOpen: !absenceJustificationOpen,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.error("Erro ao alternar justificativa", e);
    }
  };

  const totalStudents = students.length;

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'admin123') {
      setView('adminPanel');
      setPassword('');
      setError('');
    } else {
      setError('Senha incorreta.');
    }
  };

  const addClass = () => {
    const newClass: ClassItem = {
      id: Math.random().toString(36).substring(2, 9),
      name: 'NOVA TURMA',
      description: 'horário a definir...',
      multiplier: 1,
      isOpen: true,
    };
    const newClasses = [...classes, newClass];
    setClasses(newClasses);
    saveConfig(students, newClasses);
  };

  const removeClass = (id: string) => {
    const newClasses = classes.filter(c => c.id !== id);
    setClasses(newClasses);
    saveConfig(students, newClasses);
  };

  const toggleClassStatus = (id: string) => {
    const newClasses = classes.map(c => c.id === id ? { ...c, isOpen: !c.isOpen } : c);
    setClasses(newClasses);
    saveConfig(students, newClasses);
  };

  const setMultiplier = (id: string, multiplier: number) => {
    const newClasses = classes.map(c => c.id === id ? { ...c, multiplier } : c);
    setClasses(newClasses);
    saveConfig(students, newClasses);
  };

  const updateClassName = (id: string, name: string) => {
    const newClasses = classes.map(c => c.id === id ? { ...c, name } : c);
    setClasses(newClasses);
    saveConfig(students, newClasses);
  };

  const updateClassDescription = (id: string, description: string) => {
    const newClasses = classes.map(c => c.id === id ? { ...c, description } : c);
    setClasses(newClasses);
    saveConfig(students, newClasses);
  };

  const handleReset = async () => {
    const newStudents = students.map(s => ({ ...s, isAllowed: true }));
    const newClasses = classes.map(c => ({ ...c, isOpen: true }));
    setStudents(newStudents);
    setClasses(newClasses);
    saveConfig(newStudents, newClasses);

    try {
      const snapshot = await getDocs(collection(db, "enrollments"));
      const deletePromises = snapshot.docs.map(docSnap => deleteDoc(doc(db, "enrollments", docSnap.id)));
      await Promise.all(deletePromises);
    } catch (e) {
      console.error("Erro ao resetar inscrições no Firebase", e);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    const sheetId = '16vWfNpeoVaKPdaVTILFksyN0e4i2QG2BFFB8OH9vhyA';
    
    try {
      const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`);
      if (res.ok) {
        const text = await res.text();
        const rows = text.split(/\r?\n/).map(r => r.split(','));
        const newStudents: Student[] = rows.slice(1).filter(r => r[0]).map((row, i) => ({
          id: `stu-${i}`,
          name: row[0].trim().replace(/^"|"$/g, ''),
          password: row[1] ? row[1].trim().replace(/^"|"$/g, '') : 'abc123',
          isAllowed: true
        }));
        
        if (newStudents.length > 0) {
          const sortedStudents = newStudents.sort((a, b) => a.name.localeCompare(b.name));
          
          const mergedStudents = sortedStudents.map(newS => {
            const existing = students.find(oldS => oldS.name === newS.name);
            if (existing) {
              return { ...newS, isAllowed: existing.isAllowed };
            }
            return newS;
          });

          setStudents(mergedStudents);
          saveConfig(mergedStudents, classes);
          setIsSyncing(false);
          return;
        }
      }
    } catch (e) {
      console.error("Fetch falhou, usando dados de fallback", e);
    }
    
    const fallbackStudents = [
      { id: '1', name: 'ADRYAN ALVES', password: 'abc123', isAllowed: true },
      { id: '2', name: 'ANA CLARA (IRMÃ MATEUS XEREBA) - 14', password: 'abc123', isAllowed: true },
      { id: '3', name: 'ANA JÚLIA (IRMÃ DA GABI)', password: 'abc123', isAllowed: true },
      { id: '4', name: 'ANDERSON RENAN - 15', password: 'abc123', isAllowed: true },
      { id: '5', name: 'ANDREY ALVES DA SILVA', password: 'abc123', isAllowed: true },
      { id: '6', name: 'ANTÔNIO MIGUEL SANTOS', password: 'abc123', isAllowed: true },
    ];
    setStudents(fallbackStudents);
    saveConfig(fallbackStudents, classes);
    setIsSyncing(false);
  };

  const toggleStudentAllowed = (id: string, allowed: boolean) => {
    const newStudents = students.map(s => s.id === id ? { ...s, isAllowed: allowed } : s);
    setStudents(newStudents);
    saveConfig(newStudents, classes);
  };

  const allowAllStudents = () => {
    const newStudents = students.map(s => ({ ...s, isAllowed: true }));
    setStudents(newStudents);
    saveConfig(newStudents, classes);
  };

  const blockAllStudents = () => {
    const newStudents = students.map(s => ({ ...s, isAllowed: false }));
    setStudents(newStudents);
    saveConfig(newStudents, classes);
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const startStudentFlow = () => {
    setStudentStep(1);
    setSelectedStudentId(null);
    setStudentPasswordInput('');
    setStudentSearchInput('');
    setSelectedClasses([]);
    setIsAbsenceJustified(false);
    setAbsenceReason('');
    setStudentFlowError('');
    setView('studentFlow');
  };

  const handleSelectStudent = (id: string) => {
    const student = students.find(s => s.id === id);
    if (!student) return;
    if (!student.isAllowed) {
      setStudentFlowError('Você não tem permissão para acessar no momento.');
      return;
    }
    setStudentFlowError('');
    setSelectedStudentId(id);
    setStudentStep(2);
  };

  const handleValidatePassword = () => {
    const student = students.find(s => s.id === selectedStudentId);
    if (!student) return;
    if (student.password === studentPasswordInput) {
      setStudentFlowError('');
      const existingEnrollment = enrollments.find(e => e.studentId === student.id);
      setSelectedClasses(existingEnrollment ? existingEnrollment.classes : []);
      setIsAbsenceJustified(existingEnrollment?.justifiedAbsence || false);
      setAbsenceReason(existingEnrollment?.absenceReason || '');
      setStudentStep(3);
    } else {
      setStudentFlowError('Senha incorreta.');
    }
  };

  const toggleStudentClass = (classId: string) => {
    setIsAbsenceJustified(false);
    setSelectedClasses(prev => 
      prev.includes(classId) ? prev.filter(id => id !== classId) : [...prev, classId]
    );
  };

  const toggleStudentAbsence = () => {
    setIsAbsenceJustified(prev => !prev);
    setSelectedClasses([]); // mutually exclusive
  };

  const handleFinishEnrollment = async () => {
    if (!selectedStudentId) return;

    if (isAbsenceJustified && absenceReason.trim() === '') {
      setStudentFlowError('Por favor, escreva a justificativa da sua ausência.');
      return;
    }

    try {
      await setDoc(doc(db, "enrollments", selectedStudentId), {
        classes: isAbsenceJustified ? [] : selectedClasses,
        justifiedAbsence: isAbsenceJustified,
        absenceReason: isAbsenceJustified ? absenceReason.trim() : null,
        updatedAt: serverTimestamp()
      });
      setView('home');
    } catch (e) {
      console.error("Erro ao salvar inscrições", e);
      setStudentFlowError('Erro ao salvar. Tente novamente.');
    }
  };

  const pageTransition = {
    initial: { opacity: 0, y: 15 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -15 },
    transition: { duration: 0.3 }
  };

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100 overflow-x-hidden selection:bg-sky-500/30">
      <AnimatePresence mode="wait">
        
        {/* =========================================================================
            ADMIN LOGIN VIEW
        ========================================================================= */}
        {view === 'adminLogin' && (
          <motion.div key="adminLogin" {...pageTransition} className="min-h-screen flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-950/40 via-slate-950 to-slate-950">
            <div className="w-full max-w-sm bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-[2rem] p-8 shadow-2xl shadow-sky-900/10">
              <button 
                onClick={() => { setView('home'); setError(''); setPassword(''); }}
                className="flex items-center gap-2 text-slate-400 hover:text-sky-400 transition-colors mb-8 text-xs font-bold uppercase tracking-wider"
              >
                <ArrowLeft className="w-4 h-4" /> Voltar
              </button>
              
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-sky-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-sky-500/20 shadow-[0_0_15px_rgba(14,165,233,0.2)]">
                  <ShieldAlert className="w-6 h-6 text-sky-400" />
                </div>
                <h1 className="text-2xl font-black tracking-tight mb-2 text-white">Acesso Restrito</h1>
                <p className="text-slate-400 text-sm">Área exclusiva da organização.</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite a senha"
                    className="w-full bg-slate-950/50 border border-slate-700/50 rounded-2xl px-5 py-3.5 text-white text-center tracking-widest focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all placeholder:tracking-normal placeholder:text-slate-600"
                  />
                  {error && <p className="text-rose-500 text-xs font-bold text-center mt-3">{error}</p>}
                </div>
                <button 
                  type="submit"
                  className="w-full bg-gradient-to-r from-sky-500 to-sky-400 hover:from-sky-400 hover:to-sky-300 text-slate-950 font-black text-sm uppercase tracking-widest py-3.5 rounded-2xl transition-all shadow-[0_4px_14px_0_rgba(14,165,233,0.39)] hover:shadow-[0_6px_20px_rgba(14,165,233,0.23)] hover:-translate-y-0.5 active:translate-y-0"
                >
                  Entrar no Painel
                </button>
              </form>
            </div>
          </motion.div>
        )}

        {/* =========================================================================
            ADMIN PANEL VIEW
        ========================================================================= */}
        {view === 'adminPanel' && (
          <motion.div key="adminPanel" {...pageTransition} className="min-h-screen p-4 md:p-8 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-950/20 via-slate-950 to-slate-950">
            <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Header (Left) */}
              <div className="lg:col-span-8 bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl shadow-black/20">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldAlert className="w-4 h-4 text-sky-400" />
                  <span className="text-sky-400 text-xs font-black uppercase tracking-widest">Painel Administrativo</span>
                </div>
                <h1 className="text-2xl md:text-4xl font-black text-white tracking-tight mb-2 uppercase">
                  Gestão Tsunami
                </h1>
                <p className="text-slate-400 text-sm md:text-base mb-8 max-w-2xl">
                  Controle total sobre as turmas, vagas e liberações de alunos na plataforma.
                </p>
                <div className="flex flex-wrap gap-4">
                  <button 
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-75 disabled:cursor-wait text-slate-950 font-black text-xs md:text-sm uppercase tracking-widest py-3 px-6 rounded-2xl flex items-center gap-2 transition-all shadow-[0_4px_14px_0_rgba(16,185,129,0.39)] hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} /> 
                    {isSyncing ? 'Sincronizando...' : 'Sincronizar Planilha'}
                  </button>
                  <button 
                    onClick={toggleEnrollmentsLocked}
                    className={`font-bold text-xs md:text-sm uppercase tracking-widest py-3 px-6 rounded-2xl flex items-center gap-2 transition-all ${enrollmentsLocked ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-[0_4px_14px_0_rgba(245,158,11,0.39)]' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/50'}`}
                  >
                    <Lock className="w-4 h-4" /> 
                    {enrollmentsLocked ? 'Desbloquear Inscrições' : 'Trancar Inscrições'}
                  </button>
                  <button 
                    onClick={handleReset}
                    className="bg-rose-950/30 border border-rose-900/50 hover:bg-rose-900/50 hover:border-rose-700 text-rose-400 font-bold text-xs md:text-sm uppercase tracking-widest py-3 px-6 rounded-2xl flex items-center gap-2 transition-all"
                  >
                    <Trash2 className="w-4 h-4" /> Resetar Inscrições
                  </button>
                </div>
              </div>

              {/* Header (Right) */}
              <div className="lg:col-span-4 bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 md:p-8 flex flex-col justify-between shadow-xl shadow-black/20">
                <div className="flex justify-between items-start">
                  <button onClick={() => setView('home')} className="w-12 h-12 bg-slate-800/50 rounded-2xl flex items-center justify-center hover:bg-rose-950/50 hover:text-rose-400 text-slate-400 transition-colors border border-slate-700/50 hover:border-rose-900/50">
                    <LogOut className="w-5 h-5" />
                  </button>
                  <span className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-3">Sair</span>
                </div>
                <div className="mt-8">
                  <div className="text-sky-400 text-5xl md:text-6xl font-black tracking-tighter leading-none mb-2">
                    {totalStudents}
                  </div>
                  <div className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                    Alunos na Base
                  </div>
                </div>
              </div>

              {/* Left Column (Turmas) */}
              <div className="lg:col-span-7 space-y-6">
                <div className="flex justify-between items-center px-2 mt-4 lg:mt-0">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 bg-sky-500 rounded-full shadow-[0_0_10px_rgba(14,165,233,0.5)]"></div>
                    <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">Turmas & Modalidades</h2>
                  </div>
                  <button onClick={addClass} className="h-10 px-4 bg-slate-800 hover:bg-sky-500/20 text-slate-300 hover:text-sky-400 hover:border-sky-500/30 border border-slate-700 rounded-xl flex items-center justify-center gap-2 transition-all text-xs font-bold uppercase tracking-widest">
                    <Plus className="w-4 h-4" /> Nova
                  </button>
                </div>

                <div className="space-y-4">
                  {classes.map(cls => (
                    <motion.div layout key={cls.id} className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-3xl p-6 shadow-lg shadow-black/10">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-4 gap-4">
                        <input 
                          type="text"
                          value={cls.name}
                          onChange={(e) => updateClassName(cls.id, e.target.value)}
                          className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-sky-500 focus:outline-none text-xl md:text-2xl font-black text-white uppercase tracking-tight w-full px-0 py-1 transition-colors"
                          placeholder="NOME DA TURMA"
                        />
                        <button 
                          onClick={() => toggleClassStatus(cls.id)}
                          className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shrink-0 ${cls.isOpen ? 'bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
                        >
                          {cls.isOpen ? 'Ativa / Aberta' : 'Fechada'}
                        </button>
                      </div>
                      <input 
                        type="text"
                        value={cls.description}
                        onChange={(e) => updateClassDescription(cls.id, e.target.value)}
                        className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-sky-500 focus:outline-none text-sky-200/70 text-sm mb-6 w-full px-0 py-1 transition-colors"
                        placeholder="Ex: Quinta até 12h..."
                      />
                      
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                          Multiplicador (x5 vagas)
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                            <button 
                              key={num}
                              onClick={() => setMultiplier(cls.id, num)}
                              className={`w-9 h-9 rounded-xl text-sm font-bold flex items-center justify-center transition-all ${cls.multiplier === num ? 'bg-sky-500 text-slate-950 shadow-[0_0_10px_rgba(14,165,233,0.4)]' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700'}`}
                            >
                              {num}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex justify-between items-center border-t border-slate-800/80 pt-5 mt-2">
                        <span className="text-sky-400 text-sm font-black tracking-widest">
                          TOTAL: {cls.multiplier * 5} VAGAS
                        </span>
                        <button 
                          onClick={() => removeClass(cls.id)}
                          className="text-rose-500/70 hover:text-rose-400 text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" /> Excluir
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Right Column (Configs & Students) */}
              <div className="lg:col-span-5 space-y-6">
                
                {/* Configs Card */}
                <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-3xl p-6 shadow-lg shadow-black/10">
                  <div className="mb-6 flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                        Dia Ativo
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {(['TERÇA', 'SEXTA', 'SÁBADO'] as ClassDay[]).map(day => (
                          <button 
                            key={day}
                            onClick={() => setActiveDay(day)}
                            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex-1 text-center ${activeDay === day ? 'bg-sky-500 text-slate-950 shadow-[0_0_10px_rgba(14,165,233,0.3)]' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700'}`}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-3">
                       <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                         Justificativa de Ausência
                       </h3>
                    </div>
                    <button 
                      onClick={toggleAbsenceJustification}
                      className={`w-full font-bold text-xs uppercase tracking-widest py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all ${absenceJustificationOpen ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-[0_4px_14px_0_rgba(16,185,129,0.39)]' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/50'}`}
                    >
                      {absenceJustificationOpen ? 'Botão de Justificar: ABERTO' : 'Botão de Justificar: FECHADO'}
                    </button>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-2 text-center">Permite que o aluno avise que não vai treinar</p>
                  </div>
                  
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                      Quadro de Avisos
                    </h3>
                    <textarea 
                      value={notice}
                      onChange={(e) => setNotice(e.target.value)}
                      className="w-full bg-slate-950/50 border border-slate-700/50 rounded-2xl p-4 text-sm text-sky-100 resize-none h-28 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all leading-relaxed"
                    />
                  </div>
                </div>

                {/* Justificativas Recebidas */}
                <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-3xl p-6 shadow-lg shadow-black/10">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-1.5 h-5 bg-rose-500 rounded-full shadow-[0_0_10px_rgba(244,63,94,0.5)]"></div>
                    <h3 className="text-lg font-black text-white tracking-tight">Justificativas</h3>
                  </div>
                  
                  <div className="space-y-3 max-h-[350px] overflow-y-auto custom-scrollbar pr-2">
                    {(() => {
                      const justifiedEnrollments = enrollments
                        .filter(e => e.justifiedAbsence)
                        .sort((a, b) => b.updatedAt - a.updatedAt);
                        
                      if (justifiedEnrollments.length === 0) {
                        return (
                          <div className="text-center py-8 bg-slate-950/50 rounded-2xl border border-slate-800">
                            <p className="text-slate-500 text-sm uppercase tracking-widest font-bold">Nenhuma recebida.</p>
                          </div>
                        );
                      }
                      
                      return justifiedEnrollments.map(enrollment => {
                        const st = students.find(s => s.id === enrollment.studentId);
                        return (
                          <div key={enrollment.studentId} className="bg-slate-800/40 border border-slate-700/50 p-4 rounded-2xl flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-200 text-xs md:text-sm font-black uppercase tracking-widest">
                                {st?.name || 'Aluno Desconhecido'}
                              </span>
                            </div>
                            <p className="text-rose-400 text-sm font-medium bg-rose-500/10 p-3 rounded-xl border border-rose-500/20">
                              {enrollment.absenceReason || 'Nenhuma justificativa escrita.'}
                            </p>
                            <span className="text-[10px] text-slate-500 font-mono text-right">
                              {new Date(enrollment.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Liberação de Alunos */}
                <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-3xl p-6 flex flex-col h-[550px] shadow-lg shadow-black/10">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <h3 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                      <div className="w-1.5 h-5 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                      Acessos
                    </h3>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <button onClick={allowAllStudents} className="flex-1 sm:flex-none px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors text-center">
                        Liberar Todos
                      </button>
                      <button onClick={blockAllStudents} className="flex-1 sm:flex-none px-3 py-2 bg-rose-900/20 hover:bg-rose-900/40 text-rose-400 border border-rose-900/30 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors text-center">
                        Bloquear Todos
                      </button>
                    </div>
                  </div>
                  
                  <div className="relative mb-6 shrink-0">
                    <Search className="w-4 h-4 absolute left-4 top-3.5 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Pesquisar por nome..." 
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      className="w-full bg-slate-950/50 border border-slate-700/50 rounded-2xl pl-11 pr-4 py-3 text-sm text-white focus:outline-none focus:border-sky-500 transition-colors"
                    />
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-3 space-y-3">
                    {students.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-4">
                        <p className="text-sm">Nenhum aluno sincronizado ainda.</p>
                      </div>
                    ) : (
                      filteredStudents.map(student => (
                        <div key={student.id} className={`border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${student.isAllowed ? 'bg-slate-800/40 border-slate-700/50' : 'bg-rose-950/10 border-rose-900/30'}`}>
                          <div>
                            <h4 className={`font-bold text-sm tracking-tight uppercase line-clamp-1 ${student.isAllowed ? 'text-white' : 'text-rose-200/50'}`} title={student.name}>
                              {student.name}
                            </h4>
                            <p className="text-slate-500 text-[10px] mt-1 font-mono">SENHA: {student.password}</p>
                          </div>
                          <div className="flex bg-slate-950 rounded-xl p-1 gap-1 shrink-0 border border-slate-800/80">
                            <button 
                              onClick={() => toggleStudentAllowed(student.id, true)}
                              className={`px-5 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${student.isAllowed ? 'bg-emerald-500 text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                              Liberar
                            </button>
                            <button 
                              onClick={() => toggleStudentAllowed(student.id, false)}
                              className={`px-5 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${!student.isAllowed ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                              Bloquear
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>
            </div>
          </motion.div>
        )}

        {/* =========================================================================
            STUDENT FLOW VIEW
        ========================================================================= */}
        {view === 'studentFlow' && (
          <motion.div key="studentFlow" {...pageTransition} className="min-h-screen flex flex-col items-center justify-center p-4 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-blue-950/30 via-slate-950 to-slate-950">
            
            {studentStep === 1 && (
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-lg flex flex-col items-center">
                <div className="text-center mb-8">
                  <span className="inline-block px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[10px] font-black tracking-widest uppercase mb-4">Passo 01 de 03</span>
                  <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-2 text-white">Quem é você?</h1>
                  <p className="text-sky-200/60 text-sm">Pesquise e selecione seu nome na lista.</p>
                </div>
                
                <div className="w-full bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-[2rem] p-6 md:p-8 shadow-2xl flex flex-col">
                  <div className="relative mb-5 shrink-0">
                    <Search className="w-5 h-5 absolute left-4 top-3.5 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Qual o seu nome?" 
                      value={studentSearchInput}
                      onChange={(e) => setStudentSearchInput(e.target.value)}
                      className="w-full bg-slate-950/60 border border-slate-700/50 rounded-2xl pl-12 pr-4 py-3.5 text-base text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
                    />
                  </div>
                  
                  {studentFlowError && <p className="text-rose-400 text-xs font-bold text-center mb-4 p-2 bg-rose-500/10 rounded-lg">{studentFlowError}</p>}
                  
                  <div className="flex-1 max-h-[350px] overflow-y-auto custom-scrollbar pr-2 space-y-2">
                    {students
                      .filter(s => s.isAllowed && s.name.toLowerCase().includes(studentSearchInput.toLowerCase()))
                      .map(s => (
                      <button 
                        key={s.id}
                        onClick={() => handleSelectStudent(s.id)}
                        className="w-full text-left bg-slate-800/40 hover:bg-sky-500/10 border border-slate-700/50 hover:border-sky-500/30 rounded-2xl p-4 transition-all hover:pl-6"
                      >
                        <span className="text-sm font-black uppercase tracking-tight text-slate-200">{s.name}</span>
                      </button>
                    ))}
                    {students.filter(s => s.isAllowed && s.name.toLowerCase().includes(studentSearchInput.toLowerCase())).length === 0 && (
                       <p className="text-center text-slate-500 text-sm py-8">Nenhum nome encontrado.</p>
                    )}
                  </div>
                </div>

                <button 
                  onClick={() => setView('home')}
                  className="mt-8 text-slate-500 hover:text-rose-400 text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" /> Cancelar e Voltar
                </button>
              </motion.div>
            )}

            {studentStep === 2 && (
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-lg flex flex-col items-center">
                <div className="text-center mb-8">
                  <span className="inline-block px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[10px] font-black tracking-widest uppercase mb-4">Passo 02 de 03</span>
                  <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-4 text-white">Segurança</h1>
                  <div className="inline-block px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-xl">
                    <p className="text-sky-300 text-xs md:text-sm uppercase font-black tracking-widest">
                      {students.find(s => s.id === selectedStudentId)?.name}
                    </p>
                  </div>
                </div>
                
                <div className="w-full bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-[2rem] p-6 md:p-8 shadow-2xl flex flex-col gap-6">
                  <div>
                    <input 
                      type="password"
                      value={studentPasswordInput}
                      onChange={(e) => setStudentPasswordInput(e.target.value)}
                      placeholder="DIGITE SUA SENHA"
                      className="w-full bg-slate-950/60 border border-slate-700/50 rounded-2xl px-6 py-4 text-center text-lg font-black tracking-widest uppercase text-white focus:outline-none focus:border-sky-500 transition-colors"
                    />
                    {studentFlowError && <p className="text-rose-400 text-xs font-bold text-center mt-3 bg-rose-500/10 py-2 rounded-lg">{studentFlowError}</p>}
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3 mt-2">
                    <button 
                      onClick={() => setStudentStep(1)}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-xs md:text-sm uppercase tracking-widest py-4 rounded-2xl transition-colors"
                    >
                      Voltar
                    </button>
                    <button 
                      onClick={handleValidatePassword}
                      className="flex-1 bg-gradient-to-r from-sky-500 to-sky-400 hover:from-sky-400 hover:to-sky-300 text-slate-950 font-black text-xs md:text-sm uppercase tracking-widest py-4 rounded-2xl transition-all shadow-[0_4px_14px_0_rgba(14,165,233,0.39)]"
                    >
                      Validar Senha
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {studentStep === 3 && (
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-lg flex flex-col items-center">
                <div className="text-center mb-8">
                  <span className="inline-block px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black tracking-widest uppercase mb-4">Passo Final</span>
                  <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-2 text-white">Modalidades</h1>
                  <p className="text-sky-200/60 text-sm">Selecione as turmas que deseja participar.</p>
                </div>
                
                <div className="w-full bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-[2rem] p-6 md:p-8 shadow-2xl flex flex-col">
                  <div className="flex-1 max-h-[400px] overflow-y-auto custom-scrollbar pr-2 space-y-3 mb-6">
                    {absenceJustificationOpen && (
                      <div className={`rounded-2xl transition-all border mb-6 overflow-hidden ${isAbsenceJustified ? 'bg-rose-500/10 border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.15)]' : 'bg-slate-800/40 border-slate-700/50 hover:border-rose-500/50'}`}>
                        <button 
                          onClick={toggleStudentAbsence}
                          className="w-full text-left p-5 md:p-6"
                        >
                          <div className="flex justify-between items-center">
                            <span className={`text-sm md:text-base font-black uppercase tracking-tight ${isAbsenceJustified ? 'text-rose-400' : 'text-slate-300'}`}>
                              JUSTIFICAR AUSÊNCIA ARENA
                            </span>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isAbsenceJustified ? 'bg-rose-500 border-rose-500' : 'border-slate-500'}`}>
                                {isAbsenceJustified && <Check className="w-3 h-3 text-slate-950" />}
                            </div>
                          </div>
                          <p className={`text-xs mt-2 ${isAbsenceJustified ? 'text-rose-400/70' : 'text-slate-500'}`}>Escreva sua justificativa que será analisada e validada.</p>
                        </button>

                        {isAbsenceJustified && (
                          <div className="px-5 pb-5 md:px-6 md:pb-6">
                             <textarea 
                               placeholder="Escreva aqui o motivo da ausência..."
                               value={absenceReason}
                               onChange={(e) => setAbsenceReason(e.target.value)}
                               className="w-full bg-slate-950/50 border border-rose-500/30 rounded-xl p-4 text-sm text-rose-100 placeholder:text-rose-900/50 resize-none h-24 focus:outline-none focus:border-rose-500 transition-colors"
                             />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-3 opacity-100 transition-opacity" style={{ opacity: isAbsenceJustified ? 0.3 : 1, pointerEvents: isAbsenceJustified ? 'none' : 'auto' }}>
                      {classes.filter(c => c.isOpen).map(c => {
                        const isSelected = selectedClasses.includes(c.id);
                        return (
                          <button 
                            key={c.id}
                            onClick={() => toggleStudentClass(c.id)}
                            className={`w-full text-left rounded-2xl p-5 md:p-6 transition-all border ${isSelected ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.15)]' : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-500'}`}
                          >
                            <div className="flex justify-between items-center">
                              <span className={`text-sm md:text-base font-black uppercase tracking-tight ${isSelected ? 'text-emerald-400' : 'text-slate-300'}`}>
                                {c.name}
                              </span>
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-500'}`}>
                                  {isSelected && <Check className="w-3 h-3 text-slate-950" />}
                              </div>
                            </div>
                            <p className={`text-xs mt-2 ${isSelected ? 'text-emerald-500/70' : 'text-slate-500'}`}>{c.description}</p>
                          </button>
                        )
                      })}
                      {classes.filter(c => c.isOpen).length === 0 && (
                        <div className="text-center py-10 bg-slate-950/50 rounded-2xl border border-slate-800">
                          <p className="text-slate-500 text-sm uppercase tracking-widest font-bold">Nenhuma turma aberta.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {studentFlowError && <p className="text-rose-400 text-xs font-bold text-center mb-4 bg-rose-500/10 py-2 rounded-lg">{studentFlowError}</p>}

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button 
                      onClick={() => setStudentStep(2)}
                      className="sm:w-1/3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-xs md:text-sm uppercase tracking-widest py-4 rounded-2xl transition-colors"
                    >
                      Voltar
                    </button>
                    <button 
                      onClick={handleFinishEnrollment}
                      className="sm:w-2/3 bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-slate-950 font-black text-xs md:text-sm uppercase tracking-widest py-4 rounded-2xl transition-all shadow-[0_4px_14px_0_rgba(16,185,129,0.39)] hover:-translate-y-0.5"
                    >
                      Concluir Inscrição
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* =========================================================================
            HOME VIEW
        ========================================================================= */}
        {view === 'home' && (
          <motion.div key="home" {...pageTransition} className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-950/30 via-slate-950 to-slate-950 flex flex-col items-center p-4 md:p-8">
            <div className="w-full max-w-md md:max-w-xl absolute top-4 md:left-8 md:top-8 z-10 flex justify-center md:justify-start">
              <button 
                onClick={() => setView('adminLogin')}
                className="px-5 py-2.5 border border-slate-700/50 bg-slate-900/50 backdrop-blur text-slate-400 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-sky-500/10 hover:text-sky-400 hover:border-sky-500/30 transition-all text-center flex items-center gap-2"
              >
                <Lock className="w-3 h-3" /> Area Restrita
              </button>
            </div>

            <div className="w-full max-w-md md:max-w-xl space-y-6 mt-20 md:mt-24 relative z-0 pb-12">
              
              {/* Card 1: Header */}
              <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-[2rem] p-6 md:p-8 shadow-2xl shadow-sky-900/5">
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <span className="inline-block px-3 py-1 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-full text-[10px] font-black uppercase tracking-widest mb-3">
                      Agenda: {activeDay}
                    </span>
                    <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight leading-none">
                      PRÉ-INSCRIÇÕES<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-sky-200">TSUNAMI</span>
                    </h1>
                  </div>
                  <div className="w-14 h-14 md:w-20 md:h-20 rounded-full flex items-center justify-center shrink-0">
                    <img src="/logo.png" alt="Tsunami Logo" className="w-full h-full object-contain" />
                  </div>
                </div>
                
                <div className="bg-sky-950/30 border border-sky-900/50 rounded-2xl p-5 mb-6 shadow-inner relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-sky-500"></div>
                  <p className="text-sky-200 text-sm font-medium tracking-wide whitespace-pre-line leading-relaxed">
                    {notice}
                  </p>
                </div>
                
                <p className="text-slate-400 text-sm leading-relaxed">
                  Garanta sua vaga para as atividades desta semana clicando no botão abaixo.
                </p>
              </div>

              {/* Card 2: Login/CTA */}
              <div className="relative group">
                <div className={`absolute inset-0 rounded-[2rem] blur opacity-25 transition-opacity duration-500 ${enrollmentsLocked ? 'bg-rose-500/50' : 'bg-gradient-to-r from-emerald-500 to-sky-500 group-hover:opacity-40'}`}></div>
                <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-[2rem] p-8 text-center shadow-2xl">
                  {enrollmentsLocked ? (
                    <div className="py-3 flex flex-col items-center justify-center gap-2">
                      <Lock className="w-6 h-6 text-rose-500 mb-2" />
                      <h3 className="text-rose-400 font-black text-sm md:text-base uppercase tracking-widest">Inscrições Trancadas</h3>
                      <p className="text-slate-400 text-xs font-medium">Aguarde a liberação pela organização.</p>
                    </div>
                  ) : (
                    <button 
                      onClick={startStudentFlow}
                      className="w-full bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-slate-950 font-black text-sm md:text-base uppercase tracking-widest py-5 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-[0_8px_25px_rgba(16,185,129,0.35)] hover:-translate-y-1 active:translate-y-0"
                    >
                      <LogIn className="w-5 h-5" />
                      Fazer Inscrição Agora
                    </button>
                  )}
                </div>
              </div>

              {/* Card 3: Pre-list */}
              <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-[2rem] p-6 md:p-8 shadow-2xl mt-8">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
                  <h2 className="text-sm font-black text-slate-300 uppercase tracking-widest">
                    Vagas em Tempo Real
                  </h2>
                </div>
                
                {classes.filter(c => c.isOpen).length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center bg-slate-950/50 rounded-2xl border border-slate-800/50">
                    <Lock className="w-8 h-8 text-slate-600 mb-4" />
                    <p className="text-slate-500 font-black tracking-widest uppercase text-xs md:text-sm">INSCRIÇÕES FECHADAS<br/>AGUARDE A LIBERAÇÃO</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {classes.filter(c => c.isOpen).map(cls => (
                      <div key={cls.id} className="relative">
                        <div className="flex flex-col mb-4 gap-1">
                          <h3 className="text-lg md:text-xl font-black text-white uppercase tracking-tight">
                            {cls.name}
                          </h3>
                          <span className="text-sky-400/80 text-xs font-bold tracking-widest uppercase">
                            {cls.description}
                          </span>
                        </div>
                        
                        <div className="space-y-2">
                          {(() => {
                            const enrolledIds = enrollments
                              .filter(e => e.classes.includes(cls.id) && !e.justifiedAbsence)
                              .sort((a, b) => a.updatedAt - b.updatedAt)
                              .map(e => e.studentId);
                            const maxVagas = cls.multiplier * 5;
                            const isFull = enrolledIds.length >= maxVagas;
                            
                            if (enrolledIds.length === 0) {
                              return (
                                <div className="bg-slate-950/40 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between border border-dashed border-slate-700/50 gap-3">
                                  <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">
                                    Seja o primeiro a se inscrever!
                                  </span>
                                  <span className="text-emerald-500/70 text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-emerald-500/10 rounded-lg w-fit">
                                    {maxVagas} vagas livres
                                  </span>
                                </div>
                              );
                            }

                            return (
                              <>
                                {enrolledIds.map((studentId, idx) => {
                                  const st = students.find(s => s.id === studentId);
                                  const isWaitlist = idx >= maxVagas;
                                  return (
                                    <div key={studentId} className={`rounded-2xl p-4 flex items-center justify-between border transition-colors ${isWaitlist ? 'bg-rose-950/10 border-rose-900/30' : 'bg-slate-800/40 border-slate-700/50'}`}>
                                      <div className="flex items-center gap-3 md:gap-4 w-full">
                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${isWaitlist ? 'bg-rose-900/30 text-rose-400' : 'bg-slate-950 text-slate-400'}`}>
                                          {idx + 1}
                                        </div>
                                        <span className={`text-xs md:text-sm font-bold uppercase truncate max-w-[200px] md:max-w-[300px] ${isWaitlist ? 'text-rose-200/70' : 'text-slate-200'}`}>
                                          {st?.name || 'Aluno Desconhecido'}
                                        </span>
                                        {isWaitlist && (
                                          <span className="ml-auto text-[9px] font-black tracking-widest uppercase text-rose-400 border border-rose-400/30 px-2 py-1 rounded-md shrink-0">
                                            Espera
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                                <div className="pt-3 flex justify-between items-center px-1">
                                  <span className={`text-[10px] font-black uppercase tracking-widest ${isFull ? 'text-rose-500' : 'text-emerald-500'}`}>
                                    {isFull ? 'TURMA LOTADA' : 'VAGAS DISPONÍVEIS'}
                                  </span>
                                  <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest bg-slate-900 px-3 py-1 rounded-lg">
                                    {Math.min(enrolledIds.length, maxVagas)} / {maxVagas}
                                  </span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    ))}

                    {/* Justified Absences Section */}
                    {(() => {
                      const justifiedIds = enrollments
                        .filter(e => e.justifiedAbsence)
                        .sort((a, b) => a.updatedAt - b.updatedAt)
                        .map(e => e.studentId);
                        
                      if (justifiedIds.length === 0) return null;
                      
                      return (
                        <div className="pt-6 border-t border-slate-800/80 mt-8">
                          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">
                            Ausências Justificadas
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            {justifiedIds.map(studentId => {
                              const st = students.find(s => s.id === studentId);
                              return (
                                <span key={studentId} className="bg-slate-800/40 border border-slate-700/50 text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg">
                                  {st?.name || 'Aluno Desconhecido'}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
