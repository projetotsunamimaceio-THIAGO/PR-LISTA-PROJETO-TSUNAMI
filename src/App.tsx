import { useState, useEffect } from "react";
import { LogIn, Lock, ArrowLeft, Plus, Trash2, LogOut, RefreshCw, Search, X } from "lucide-react";
import { doc, setDoc, getDocs, deleteDoc, onSnapshot, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./lib/firebase";

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

  // Student Flow State
  const [studentStep, setStudentStep] = useState<1 | 2 | 3>(1);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentPasswordInput, setStudentPasswordInput] = useState('');
  const [studentSearchInput, setStudentSearchInput] = useState('');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [studentFlowError, setStudentFlowError] = useState('');

  // Config Subscription (Firebase)
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "config", "settings"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.students) setStudents(data.students);
        if (data.classes) setClasses(data.classes);
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
    // Reset local state for students and classes
    const newStudents = students.map(s => ({ ...s, isAllowed: true }));
    const newClasses = classes.map(c => ({ ...c, isOpen: true }));
    setStudents(newStudents);
    setClasses(newClasses);
    saveConfig(newStudents, newClasses);

    // Delete all enrollments in Firestore
    try {
      const snapshot = await getDocs(collection(db, "enrollments"));
      const deletePromises = snapshot.docs.map(docSnap => deleteDoc(doc(db, "enrollments", docSnap.id)));
      await Promise.all(deletePromises);
    } catch (e) {
      console.error("Erro ao resetar inscrições no Firebase", e);
    }
  };

  // Sync Data (real CSV fetch with fallback)
  const handleSync = async () => {
    setIsSyncing(true);
    const sheetId = '16vWfNpeoVaKPdaVTILFksyN0e4i2QG2BFFB8OH9vhyA';
    
    try {
      // Try fetching public CSV
      const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`);
      if (res.ok) {
        const text = await res.text();
        const rows = text.split(/\r?\n/).map(r => r.split(','));
        const newStudents: Student[] = rows.slice(1).filter(r => r[0]).map((row, i) => ({
          id: `stu-${i}`,
          name: row[0].trim().replace(/^"|"$/g, ''),
          password: row[1] ? row[1].trim().replace(/^"|"$/g, '') : 'abc123',
          isAllowed: true // start as allowed
        }));
        
        if (newStudents.length > 0) {
          const sortedStudents = newStudents.sort((a, b) => a.name.localeCompare(b.name));
          
          // Preserve the isAllowed status from existing students if they exist
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
    
    // Fallback
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

  // --- Student Flow Methods ---
  const startStudentFlow = () => {
    setStudentStep(1);
    setSelectedStudentId(null);
    setStudentPasswordInput('');
    setStudentSearchInput('');
    setSelectedClasses([]);
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
      // Pre-fill previously selected classes if any
      const existingEnrollment = enrollments.find(e => e.studentId === student.id);
      setSelectedClasses(existingEnrollment ? existingEnrollment.classes : []);
      setStudentStep(3);
    } else {
      setStudentFlowError('Senha incorreta.');
    }
  };

  const toggleStudentClass = (classId: string) => {
    setSelectedClasses(prev => 
      prev.includes(classId) ? prev.filter(id => id !== classId) : [...prev, classId]
    );
  };

  const handleFinishEnrollment = async () => {
    if (!selectedStudentId) return;
    try {
      await setDoc(doc(db, "enrollments", selectedStudentId), {
        classes: selectedClasses,
        updatedAt: serverTimestamp()
      });
      setView('home');
    } catch (e) {
      console.error("Erro ao salvar inscrições", e);
      setStudentFlowError('Erro ao salvar. Tente novamente.');
    }
  };
  // ----------------------------

  if (view === 'adminLogin') {
    return (
      <div className="min-h-screen bg-[#0a0f16] flex items-center justify-center p-4 font-sans text-white">
        <div className="w-full max-w-sm bg-[#121921] border border-slate-800/50 rounded-3xl p-8 shadow-2xl">
          <button 
            onClick={() => {
              setView('home');
              setError('');
              setPassword('');
            }}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-8 text-sm font-bold uppercase tracking-wider"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
          
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-[#0f2c22] rounded-full flex items-center justify-center mx-auto mb-4 border border-[#164a38]">
              <Lock className="w-6 h-6 text-[#2bd98a]" />
            </div>
            <h1 className="text-2xl font-black tracking-tight mb-2">Acesso Restrito</h1>
            <p className="text-slate-400 text-sm">Insira a senha de administrador.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha"
                className="w-full bg-[#1a232e] border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#2bd98a] transition-colors"
              />
              {error && <p className="text-red-400 text-xs font-bold mt-2 ml-1">{error}</p>}
            </div>
            <button 
              type="submit"
              className="w-full bg-[#2bd98a] hover:bg-[#25b875] text-black font-black text-sm uppercase tracking-widest py-3 rounded-xl transition-colors"
            >
              Entrar
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'adminPanel') {
    return (
      <div className="min-h-screen bg-[#0a0f16] p-4 md:p-8 font-sans text-white relative">
        <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Header Block (Left) */}
          <div className="lg:col-span-8 bg-[#121921] border border-slate-800/50 rounded-3xl p-6 md:p-8">
            <div className="flex items-center gap-2 mb-2">
              <Lock className="w-4 h-4 text-[#2bd98a]" />
              <span className="text-[#2bd98a] text-[10px] font-black uppercase tracking-widest">Sistema de Controle</span>
            </div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-black text-white tracking-tight mb-2 uppercase">
              Painel Administrativo
            </h1>
            <p className="text-slate-400 text-sm mb-8">
              Gerencie turmas, alunos e configurações do sistema.
            </p>
            <div className="flex flex-wrap gap-4">
              <button 
                onClick={handleSync}
                disabled={isSyncing}
                className="bg-[#2bd98a] hover:bg-[#25b875] disabled:opacity-75 disabled:cursor-wait text-black font-black text-xs uppercase tracking-widest py-2.5 px-5 rounded-full flex items-center gap-2 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} /> 
                {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
              </button>
              <button 
                onClick={handleReset}
                className="bg-transparent border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold text-xs uppercase tracking-widest py-2.5 px-5 rounded-full flex items-center gap-2 transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Resetar
              </button>
            </div>
          </div>

          {/* Header Block (Right) */}
          <div className="lg:col-span-4 bg-[#121921] border border-slate-800/50 rounded-3xl p-6 md:p-8 flex flex-col justify-between overflow-hidden">
            <div className="flex justify-between items-start">
              <button onClick={() => setView('home')} className="w-12 h-12 bg-[#0f2c22] rounded-full flex items-center justify-center hover:bg-[#164a38] transition-colors border border-[#164a38]">
                <LogOut className="w-5 h-5 text-[#2bd98a]" />
              </button>
              <span className="text-slate-300 text-[10px] font-bold uppercase tracking-widest mt-4">Encerrar Sessão</span>
            </div>
            <div className="mt-8">
              <div className="text-[#2bd98a] text-5xl md:text-6xl font-black tracking-tighter leading-none mb-1">
                {totalStudents}
              </div>
              <div className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                Alunos Cadastrados
              </div>
            </div>
          </div>

          {/* Left Column (Gestão de Turmas) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="flex justify-between items-center px-2">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-6 bg-[#2bd98a] rounded-full"></div>
                <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">Gestão de Turmas</h2>
              </div>
              <button onClick={addClass} className="w-8 h-8 bg-[#1a232e] hover:bg-slate-800 text-white rounded-full flex items-center justify-center transition-colors">
                <Plus className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {classes.map(cls => (
                <div key={cls.id} className="bg-[#121921] border border-slate-800/50 rounded-3xl p-6">
                  <div className="flex justify-between items-start mb-2 gap-4">
                    <input 
                      type="text"
                      value={cls.name}
                      onChange={(e) => updateClassName(cls.id, e.target.value)}
                      className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-[#2bd98a] focus:outline-none text-base md:text-lg font-black text-white uppercase tracking-tight w-full px-1 py-0.5 transition-colors"
                      placeholder="NOME DA TURMA"
                    />
                    <button 
                      onClick={() => toggleClassStatus(cls.id)}
                      className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors shrink-0 ${cls.isOpen ? 'bg-[#2bd98a] text-black' : 'bg-transparent text-slate-300 border border-slate-700'}`}
                    >
                      {cls.isOpen ? 'Aberta' : 'Fechada'}
                    </button>
                  </div>
                  <input 
                    type="text"
                    value={cls.description}
                    onChange={(e) => updateClassDescription(cls.id, e.target.value)}
                    className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-[#2bd98a] focus:outline-none text-slate-400 text-sm mb-6 w-full px-1 py-0.5 transition-colors"
                    placeholder="Descrição / Horário..."
                  />
                  
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
                    <span className="text-slate-400 text-[11px] font-bold uppercase tracking-widest">
                      Vagas (L X 5)
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                        <button 
                          key={num}
                          onClick={() => setMultiplier(cls.id, num)}
                          className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition-colors ${cls.multiplier === num ? 'bg-[#2bd98a] text-black' : 'bg-[#1a232e] text-slate-400 hover:bg-slate-700'}`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-between items-center border-t border-slate-800/50 pt-4">
                    <span className="text-slate-400 text-[11px] font-medium">
                      Total: {cls.multiplier * 5} vagas
                    </span>
                    <button 
                      onClick={() => removeClass(cls.id)}
                      className="text-slate-300 hover:text-white text-[10px] font-bold uppercase tracking-widest transition-colors"
                    >
                      Remover Turma
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column (Configurations & Students) */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Configs Card 1: Dia Ativo & Aviso */}
            <div className="bg-[#121921] border border-slate-800/50 rounded-3xl p-6 md:p-8 flex flex-col sm:flex-row gap-8">
              <div className="flex-1">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">
                  Dia Ativo
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(['TERÇA', 'SEXTA', 'SÁBADO'] as ClassDay[]).map(day => (
                    <button 
                      key={day}
                      onClick={() => setActiveDay(day)}
                      className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${activeDay === day ? 'bg-[#2bd98a] text-black' : 'bg-[#1a232e] text-slate-400 hover:bg-slate-800'}`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex-1">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">
                  Aviso Geral
                </h3>
                <textarea 
                  value={notice}
                  onChange={(e) => setNotice(e.target.value)}
                  className="w-full bg-[#1a232e] border border-transparent rounded-2xl p-4 text-sm text-slate-300 resize-none h-24 focus:outline-none focus:border-[#2bd98a] transition-all"
                />
              </div>
            </div>

            {/* Configs Card 2: Actions */}
            <div className="bg-[#121921] border border-slate-800/50 rounded-3xl p-6 grid grid-cols-2 gap-4">
              <button className="bg-[#1a232e] hover:bg-slate-800 border border-slate-800/50 rounded-3xl py-6 px-4 flex items-center justify-center text-center transition-colors">
                <span className="text-slate-300 text-[10px] font-black uppercase tracking-widest leading-relaxed">
                  Travar<br/>Inscrições
                </span>
              </button>
              <button className="bg-[#1a232e] hover:bg-slate-800 border border-slate-800/50 rounded-3xl py-6 px-4 flex items-center justify-center text-center transition-colors">
                <span className="text-slate-300 text-[10px] font-black uppercase tracking-widest leading-relaxed">
                  Justificativas<br/>Fechadas
                </span>
              </button>
            </div>

            {/* Configs Card 3: Liberação de Alunos */}
            <div className="bg-[#121921] border border-slate-800/50 rounded-3xl p-6 flex flex-col h-[600px]">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-base md:text-lg font-black text-white tracking-tight">Liberação de Alunos</h3>
                <div className="flex gap-4">
                  <button onClick={allowAllStudents} className="text-[#2bd98a] hover:text-[#25b875] text-[10px] font-black uppercase tracking-widest transition-colors">
                    Liberar Todos
                  </button>
                  <button onClick={blockAllStudents} className="text-white hover:text-slate-300 text-[10px] font-black uppercase tracking-widest transition-colors">
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
                  className="w-full bg-[#1a232e] border border-slate-700 rounded-full pl-11 pr-4 py-3 text-sm text-white focus:outline-none focus:border-[#2bd98a] transition-colors"
                />
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-3 space-y-3">
                {students.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-4">
                    <p className="text-sm">Nenhum aluno sincronizado ainda.</p>
                    <p className="text-xs mt-2">Clique no botão "Sincronizar" no topo para importar os alunos da planilha.</p>
                  </div>
                ) : (
                  filteredStudents.map(student => (
                    <div key={student.id} className="bg-[#1a232e] border border-slate-800/50 rounded-2xl p-4 flex justify-between items-center transition-colors hover:border-slate-700">
                      <div>
                        <h4 className="text-white font-bold text-sm tracking-tight uppercase max-w-[200px] truncate" title={student.name}>
                          {student.name}
                        </h4>
                        <p className="text-slate-500 text-[10px] mt-0.5">Senha: {student.password}</p>
                      </div>
                      <div className="flex bg-[#121921] rounded-full p-1 gap-1 shrink-0 border border-slate-800/50">
                        <button 
                          onClick={() => toggleStudentAllowed(student.id, true)}
                          className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-full transition-colors ${student.isAllowed ? 'bg-[#2bd98a] text-black shadow-sm' : 'text-slate-400 hover:text-white'}`}
                        >
                          SIM
                        </button>
                        <button 
                          onClick={() => toggleStudentAllowed(student.id, false)}
                          className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-full transition-colors ${!student.isAllowed ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                        >
                          NÃO
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // Student Flow View
  if (view === 'studentFlow') {
    return (
      <div className="min-h-screen bg-[#0a0f16] flex flex-col items-center justify-center p-4 font-sans text-white">
        
        {/* Step 1: Select Student */}
        {studentStep === 1 && (
          <div className="w-full max-w-lg flex flex-col items-center">
            <div className="text-center mb-8">
              <p className="text-[#2bd98a] text-[10px] font-black tracking-widest uppercase mb-2">PASSO 01</p>
              <h1 className="text-3xl font-black uppercase tracking-tight mb-2">Quem é você?</h1>
              <p className="text-slate-400 text-sm">Selecione seu nome na lista oficial</p>
            </div>
            
            <div className="w-full bg-[#121921] border border-slate-800/50 rounded-3xl p-6 shadow-2xl flex flex-col">
              <div className="relative mb-4 shrink-0">
                <Search className="w-4 h-4 absolute left-4 top-3.5 text-slate-500" />
                <input 
                  type="text" 
                  placeholder="Pesquisar seu nome..." 
                  value={studentSearchInput}
                  onChange={(e) => setStudentSearchInput(e.target.value)}
                  className="w-full bg-[#1a232e] border border-transparent rounded-full pl-11 pr-4 py-3 text-sm text-white focus:outline-none focus:border-[#2bd98a] transition-colors"
                />
              </div>
              
              {studentFlowError && <p className="text-red-400 text-xs font-bold text-center mb-4">{studentFlowError}</p>}
              
              <div className="flex-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-2 space-y-2">
                {students
                  .filter(s => s.isAllowed && s.name.toLowerCase().includes(studentSearchInput.toLowerCase()))
                  .map(s => (
                  <button 
                    key={s.id}
                    onClick={() => handleSelectStudent(s.id)}
                    className="w-full text-left bg-[#1a232e] hover:bg-slate-800 border border-transparent hover:border-slate-700 rounded-2xl p-4 transition-colors"
                  >
                    <span className="text-sm font-black uppercase tracking-tight text-slate-300">{s.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <button 
              onClick={() => setView('home')}
              className="mt-8 text-slate-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors"
            >
              VOLTAR
            </button>
          </div>
        )}

        {/* Step 2: Password */}
        {studentStep === 2 && (
          <div className="w-full max-w-lg flex flex-col items-center">
            <div className="text-center mb-8">
              <p className="text-[#2bd98a] text-[10px] font-black tracking-widest uppercase mb-2">PASSO 02</p>
              <h1 className="text-3xl font-black uppercase tracking-tight mb-2">Segurança</h1>
              <p className="text-slate-400 text-sm uppercase font-bold tracking-widest">
                {students.find(s => s.id === selectedStudentId)?.name}
              </p>
            </div>
            
            <div className="w-full bg-[#121921] border border-slate-800/50 rounded-3xl p-6 shadow-2xl flex flex-col gap-4">
              <div>
                <input 
                  type="password"
                  value={studentPasswordInput}
                  onChange={(e) => setStudentPasswordInput(e.target.value)}
                  placeholder="DIGITE SUA SENHA"
                  className="w-full bg-[#1a232e] border border-transparent rounded-full px-6 py-4 text-center text-sm font-black tracking-widest uppercase text-white focus:outline-none focus:border-[#2bd98a] transition-colors"
                />
                {studentFlowError && <p className="text-red-400 text-xs font-bold text-center mt-3">{studentFlowError}</p>}
              </div>
              
              <div className="flex gap-4 mt-2">
                <button 
                  onClick={() => setStudentStep(1)}
                  className="flex-1 bg-[#1a232e] hover:bg-slate-800 text-slate-300 font-black text-xs uppercase tracking-widest py-4 rounded-full transition-colors"
                >
                  VOLTAR
                </button>
                <button 
                  onClick={handleValidatePassword}
                  className="flex-1 bg-[#2bd98a] hover:bg-[#25b875] text-black font-black text-xs uppercase tracking-widest py-4 rounded-full transition-colors"
                >
                  VALIDAR
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Select Classes */}
        {studentStep === 3 && (
          <div className="w-full max-w-lg flex flex-col items-center">
            <div className="text-center mb-8">
              <p className="text-[#2bd98a] text-[10px] font-black tracking-widest uppercase mb-2">PASSO 03</p>
              <h1 className="text-3xl font-black uppercase tracking-tight mb-2">Esportes</h1>
              <p className="text-slate-400 text-sm">Selecione suas modalidades preferidas</p>
            </div>
            
            <div className="w-full bg-[#121921] border border-slate-800/50 rounded-3xl p-6 shadow-2xl flex flex-col">
              <div className="flex-1 max-h-[400px] overflow-y-auto custom-scrollbar pr-2 space-y-3 mb-6">
                {classes.filter(c => c.isOpen).map(c => {
                  const isSelected = selectedClasses.includes(c.id);
                  return (
                    <button 
                      key={c.id}
                      onClick={() => toggleStudentClass(c.id)}
                      className={`w-full text-left rounded-2xl p-5 transition-all flex justify-between items-center ${isSelected ? 'bg-[#2bd98a] shadow-[0_0_20px_rgba(43,217,138,0.15)]' : 'bg-[#1a232e] hover:bg-slate-800'}`}
                    >
                      <span className={`text-sm font-black uppercase tracking-tight ${isSelected ? 'text-black' : 'text-slate-300'}`}>
                        {c.name}
                      </span>
                      <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-black/60' : 'bg-transparent'}`}></div>
                    </button>
                  )
                })}
                {classes.filter(c => c.isOpen).length === 0 && (
                  <p className="text-slate-500 text-sm text-center py-4">Nenhuma turma aberta no momento.</p>
                )}
              </div>

              {studentFlowError && <p className="text-red-400 text-xs font-bold text-center mb-4">{studentFlowError}</p>}

              <div className="flex gap-4">
                <button 
                  onClick={() => setStudentStep(2)}
                  className="flex-1 bg-[#1a232e] hover:bg-slate-800 text-slate-300 font-black text-xs uppercase tracking-widest py-4 rounded-full transition-colors"
                >
                  VOLTAR
                </button>
                <button 
                  onClick={handleFinishEnrollment}
                  className="flex-1 bg-[#2bd98a] hover:bg-[#25b875] text-black font-black text-xs uppercase tracking-widest py-4 rounded-full transition-colors"
                >
                  CONCLUIR
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Home View
  return (
    <div className="min-h-screen bg-[#0a0f16] flex flex-col items-center p-4 md:p-8 font-sans">
      <div className="w-full max-w-md absolute top-4 md:left-8 md:top-8 z-10 flex justify-center md:justify-start">
        <button 
          onClick={() => setView('adminLogin')}
          className="px-6 py-3 border border-slate-700 text-slate-300 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 hover:text-white transition-colors text-center leading-relaxed"
        >
          Acesso<br />Administrador
        </button>
      </div>

      <div className="w-full max-w-md space-y-6 mt-20 md:mt-16 relative z-0">
        
        {/* Card 1: Header */}
        <div className="bg-[#121921] border border-slate-800/50 rounded-3xl p-6 shadow-2xl">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-[#2bd98a] text-[10px] font-black uppercase tracking-widest mb-1">
                Esportes - {activeDay}
              </p>
              <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                Pré Inscrição
              </h1>
            </div>
            <div className="text-right">
              <h2 className="text-[#38bdf8] text-base md:text-lg font-black leading-tight">
                Projeto<br />TSUNAMI
              </h2>
            </div>
          </div>
          
          <div className="bg-[#0f2c22] border border-[#164a38] rounded-full py-2.5 px-4 mb-5 text-center shadow-inner">
            <span className="text-[#2bd98a] text-[11px] font-black tracking-widest uppercase whitespace-pre-line">
              {notice}
            </span>
          </div>
          
          <p className="text-slate-400 text-sm leading-relaxed">
            Siga o fluxo abaixo para garantir sua vaga. A pré-lista de inscritos está disponível abaixo.
          </p>
        </div>

        {/* Card 2: Login */}
        <div className="bg-[#121921] border border-slate-800/50 rounded-3xl p-8 shadow-2xl text-center">
          <p className="text-[#2bd98a] text-[10px] font-black uppercase tracking-widest mb-2">
            Seja Bem-Vindo!
          </p>
          <p className="text-slate-400 text-sm mb-8">
            Inicie sua pré-inscrição agora.
          </p>
          
          <button 
            onClick={startStudentFlow}
            className="w-full bg-[#2bd98a] hover:bg-[#25b875] text-black font-black text-sm uppercase tracking-widest py-4 px-6 rounded-full flex items-center justify-center gap-3 transition-colors"
          >
            <LogIn className="w-5 h-5" />
            Entrar
          </button>
        </div>

        {/* Card 3: Pre-list (Dynamic based on classes) */}
        <div className="bg-[#121921] border border-slate-800/50 rounded-3xl p-6 shadow-2xl">
          <p className="text-[#2bd98a] text-[10px] font-black uppercase tracking-widest mb-6">
            Pré-Lista de Inscritos
          </p>
          
          {classes.filter(c => c.isOpen).length === 0 ? (
            <div className="py-8 flex flex-col items-center justify-center text-center bg-[#1a232e] rounded-2xl border border-slate-800/50">
              <Lock className="w-8 h-8 text-slate-500 mb-3" />
              <p className="text-slate-400 font-black tracking-widest uppercase text-sm">AGUARDANDO ABRIR<br/>A TURMA!</p>
            </div>
          ) : (
            <div className="space-y-8">
              {classes.filter(c => c.isOpen).map(cls => (
                <div key={cls.id}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                    <h3 className="text-lg md:text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                      {cls.name}
                    </h3>
                    <span className="bg-[#1a232e] text-slate-400 text-[10px] px-3 py-1.5 rounded-full whitespace-nowrap self-start">
                      {cls.description}
                    </span>
                  </div>
                  
                  {/* Mocked enrolled student list placeholder for the class */}
                  <div className="space-y-2">
                    {(() => {
                      const enrolledIds = enrollments
                        .filter(e => e.classes.includes(cls.id))
                        .sort((a, b) => a.updatedAt - b.updatedAt)
                        .map(e => e.studentId);
                      const maxVagas = cls.multiplier * 5;
                      
                      if (enrolledIds.length === 0) {
                        return (
                          <div className="bg-[#1a232e] rounded-2xl p-4 flex items-center justify-between border border-transparent cursor-default">
                            <div className="flex items-center gap-3">
                              <span className="text-slate-500 text-sm font-bold uppercase">
                                Aguardando inscrições...
                              </span>
                            </div>
                            <span className="text-slate-600 text-[10px] font-bold uppercase tracking-widest">
                              {maxVagas} vagas totais
                            </span>
                          </div>
                        );
                      }

                      return (
                        <>
                          {enrolledIds.map((studentId, idx) => {
                            const st = students.find(s => s.id === studentId);
                            return (
                              <div key={studentId} className="bg-[#1a232e] rounded-2xl p-4 flex items-center justify-between border border-transparent transition-colors">
                                <div className="flex items-center gap-3">
                                  <div className="w-6 h-6 rounded-full bg-[#212d3b] text-slate-400 flex items-center justify-center text-xs font-bold shrink-0">
                                    {idx + 1}
                                  </div>
                                  <span className="text-slate-300 text-sm font-bold uppercase truncate max-w-[200px] md:max-w-[280px]">
                                    {st?.name || 'Aluno Desconhecido'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                          <div className="pt-2 text-right">
                            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                              {enrolledIds.length} / {maxVagas} vagas preenchidas
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
