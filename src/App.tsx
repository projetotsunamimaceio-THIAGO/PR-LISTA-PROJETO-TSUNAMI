import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from "react";
import { 
  LogIn, 
  Lock, 
  ArrowLeft, 
  Plus, 
  Trash2, 
  LogOut, 
  RefreshCw, 
  Search, 
  X, 
  Check, 
  ShieldAlert, 
  Save, 
  Users, 
  Shuffle, 
  Scale, 
  ArrowRight,
  Sparkles,
  ChevronRight,
  Activity,
  Calendar,
  Trophy,
  AlertCircle,
  ShieldCheck,
  Flame,
  CheckCircle2,
  Sliders,
  UserCheck
} from "lucide-react";
import { doc, setDoc, getDocs, deleteDoc, onSnapshot, collection, serverTimestamp, addDoc, query, orderBy, limit } from "firebase/firestore";
import { db } from "./lib/firebase";
import { motion, AnimatePresence } from "framer-motion";
import { TeamDrawModal } from "./components/TeamDrawModal";
import { SaturdaySportModal } from "./components/SaturdaySportModal";
import type { Participant, DrawResult } from "./types";

type ClassDay = 'SEGUNDA' | 'TERÇA' | 'QUARTA' | 'QUINTA' | 'SEXTA' | 'SÁBADO' | 'DOMINGO' | string;

export const AVAILABLE_DAYS: ClassDay[] = ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO', 'DOMINGO'];

interface ClassItem {
  id: string;
  name: string;
  description: string;
  multiplier: number; // 1 to 8 (each represents 5 vagas)
  isOpen: boolean;
}

export const SKILL_LEVEL_OPTIONS = [
  { level: 1, stars: '⭐', label: 'Iniciante' },
  { level: 2, stars: '⭐⭐', label: 'Amadora' },
  { level: 3, stars: '⭐⭐⭐', label: 'Regular, Sabe joga' },
  { level: 4, stars: '⭐⭐⭐⭐', label: 'Bom' },
  { level: 5, stars: '⭐⭐⭐⭐⭐', label: 'Muito bom' },
] as const;

export const getSkillStars = (level?: number): string => {
  const safe = Math.min(5, Math.max(1, Math.round(level || 3)));
  return '⭐'.repeat(safe);
};

interface Student {
  id: string;
  name: string;
  password?: string;
  isAllowed: boolean;
  behaviorScore?: number;
  infractions?: string[];
  allowedClasses?: string[];
  classLevels?: Record<string, number>;
  skillLevel?: number;
}

interface EnrollmentRecord {
  studentId: string;
  studentName?: string;
  isGuest?: boolean;
  guestOf?: string;
  classes: string[];
  classLevels?: Record<string, number>;
  guests?: Record<string, string[]>;
  guestLevels?: Record<string, number[]>;
  skillLevel?: number;
  updatedAt: number;
  justifiedAbsence?: boolean;
  absenceReason?: string;
}

interface ActivityLog {
  id: string;
  studentName: string;
  action: 'enrolled' | 'unenrolled' | 'changed' | 'justified';
  details: string;
  timestamp: number;
}

export default function App() {
  const [view, setView] = useState<'home' | 'adminLogin' | 'adminPanel' | 'studentFlow' | 'justificationFlow'>('home');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Admin state
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('tsunami_admin_auth') === 'true';
    } catch {
      return false;
    }
  });
  const [adminQuickLoginOpen, setAdminQuickLoginOpen] = useState(false);
  const [saturdaySportOpen, setSaturdaySportOpen] = useState(false);
  const [quickAdminPassword, setQuickAdminPassword] = useState('');
  const [quickAdminError, setQuickAdminError] = useState('');
  const [updatedFlashKey, setUpdatedFlashKey] = useState<string | null>(null);

  const [activeDay, setActiveDay] = useState<ClassDay>(() => {
    try {
      const cached = localStorage.getItem('tsunami_active_day');
      if (cached) return cached as ClassDay;
    } catch {
      // fallback
    }
    return 'SEXTA';
  });
  const [isSavingDay, setIsSavingDay] = useState(false);
  const [daySavedSuccess, setDaySavedSuccess] = useState(false);
  const [notice, setNotice] = useState('Turmas abertas. Faça sua\ninscrição!!');
  const [isSavingNotice, setIsSavingNotice] = useState(false);
  const [noticeSavedSuccess, setNoticeSavedSuccess] = useState(false);
  const isEditingNoticeRef = useRef(false);
  
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
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [enrollmentsLocked, setEnrollmentsLocked] = useState(false);
  const [absenceJustificationOpen, setAbsenceJustificationOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string>('');

  // Student Flow State (Enrollment)
  const [studentStep, setStudentStep] = useState<1 | 2 | 3>(1);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [studentPasswordInput, setStudentPasswordInput] = useState('');
  const [studentSearchInput, setStudentSearchInput] = useState('');
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedGuests, setSelectedGuests] = useState<Record<string, string[]>>({});
  const [selectedGuestLevels, setSelectedGuestLevels] = useState<Record<string, number[]>>({});
  const [selectedStudentLevel, setSelectedStudentLevel] = useState<number>(3);
  const [selectedStudentLevels, setSelectedStudentLevels] = useState<Record<string, number>>({});
  const [enrollmentSubTab, setEnrollmentSubTab] = useState<'classes' | 'guests'>('classes');
  const [guestClassId, setGuestClassId] = useState<string>('');
  const [studentFlowError, setStudentFlowError] = useState('');

  // Justification Flow State
  const [justificationStep, setJustificationStep] = useState<1 | 2 | 3>(1);
  const [absenceReason, setAbsenceReason] = useState('');

  // Team Draws State
  const [savedDraws, setSavedDraws] = useState<Record<string, DrawResult>>({});
  const [activeDrawClassId, setActiveDrawClassId] = useState<string | null>(null);

  // Behavior Evaluation State
  const [behaviorSearchInput, setBehaviorSearchInput] = useState('');
  const [selectedBehaviorStudentId, setSelectedBehaviorStudentId] = useState<string | null>(null);

  const handleApplyBehaviorPenalty = async (studentId: string, penalty: number, reason: string) => {
    const updatedStudents = students.map(s => {
      if (s.id === studentId) {
        const currentScore = s.behaviorScore !== undefined ? s.behaviorScore : 10;
        const newScore = Math.max(0, currentScore - penalty);
        const newInfractions = [...(s.infractions || []), reason];
        return { ...s, behaviorScore: newScore, infractions: newInfractions };
      }
      return s;
    });
    setStudents(updatedStudents); // Optimistic UI update
    await saveConfig(updatedStudents, classes);
  };

  const handleResetBehavior = async (studentId: string) => {
    const updatedStudents = students.map(s => {
      if (s.id === studentId) {
        return { ...s, behaviorScore: 10, infractions: [] };
      }
      return s;
    });
    setStudents(updatedStudents); // Optimistic UI update
    await saveConfig(updatedStudents, classes);
  };

  // Config Subscription (Firebase)
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "config", "settings"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.activeDay) {
          setActiveDay(data.activeDay);
          try {
            localStorage.setItem('tsunami_active_day', data.activeDay);
          } catch {
            // fallback
          }
        }
        if (data.students) setStudents(data.students);
        if (data.classes) setClasses(data.classes);
        if (data.enrollmentsLocked !== undefined) setEnrollmentsLocked(data.enrollmentsLocked);
        if (data.absenceJustificationOpen !== undefined) setAbsenceJustificationOpen(data.absenceJustificationOpen);
        if (data.logoUrl !== undefined) setLogoUrl(data.logoUrl);
        if (data.notice !== undefined && !isEditingNoticeRef.current) {
          setNotice(data.notice);
        }
        if (data.teamDraws !== undefined) {
          setSavedDraws(data.teamDraws);
        }
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
          studentName: data.studentName || '',
          isGuest: !!data.isGuest,
          guestOf: data.guestOf || '',
          classes: data.classes || [],
          classLevels: data.classLevels || {},
          guests: data.guests || {},
          guestLevels: data.guestLevels || {},
          skillLevel: data.skillLevel || data.studentLevel || 3,
          updatedAt: data.updatedAt?.toMillis?.() || Date.now(),
          justifiedAbsence: data.justifiedAbsence || false,
          absenceReason: data.absenceReason || '',
        });
      });
      setEnrollments(newEnrollments);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "activity_logs"), orderBy("timestamp", "desc"), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs: ActivityLog[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        logs.push({
          id: doc.id,
          studentName: data.studentName,
          action: data.action,
          details: data.details,
          timestamp: data.timestamp?.toMillis?.() || Date.now()
        });
      });
      setActivityLogs(logs);
    }, (err) => {
      console.error("Error fetching activity logs: ", err);
    });
    return () => unsubscribe();
  }, []);

  const saveConfig = async (newStudents: Student[], newClasses: ClassItem[]) => {
    try {
      await setDoc(doc(db, "config", "settings"), {
        students: newStudents,
        classes: newClasses,
        activeDay: activeDay,
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

  const handleSaveDraw = async (draw: DrawResult) => {
    try {
      const updatedDraws = { ...savedDraws, [draw.classId]: draw };
      setSavedDraws(updatedDraws);
      await setDoc(doc(db, "config", "settings"), {
        teamDraws: updatedDraws,
        updatedAt: serverTimestamp()
      }, { merge: true });

      await addDoc(collection(db, "activity_logs"), {
        studentName: 'Organização',
        action: 'changed',
        details: `Sorteou linhas equilibradas para ${draw.className}: ${draw.teams.length} times de ${draw.teamSize} jogadores`,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error("Erro ao salvar sorteio", e);
    }
  };

  const getClassParticipants = (classId: string): Participant[] => {
    const classEnrollments = enrollments
      .filter(e => (e.classes.includes(classId) || (e.guests?.[classId] && e.guests[classId].length > 0)) && !e.justifiedAbsence)
      .sort((a, b) => a.updatedAt - b.updatedAt);

    const participants: Participant[] = [];
    let count = 1;

    for (const enr of classEnrollments) {
      const st = students.find(s => s.id === enr.studentId);
      const studentName = enr.studentName || st?.name || (enr.isGuest ? 'Convidado' : 'Aluno Desconhecido');
      
      if (enr.classes.includes(classId)) {
        const studentLevel = enr.classLevels?.[classId] || enr.skillLevel || st?.classLevels?.[classId] || st?.skillLevel || 3;
        participants.push({
          key: `${enr.studentId}-main`,
          name: studentName,
          isGuest: !!enr.isGuest,
          guestOf: enr.guestOf || (enr.isGuest ? 'Admin' : undefined),
          studentId: enr.studentId,
          level: studentLevel,
          enrolledIndex: count++,
        });
      }

      const guestList = (enr.guests?.[classId] || [])
        .map(g => g.trim())
        .filter(g => g.length > 0)
        .slice(0, 2);
      const guestLevels = enr.guestLevels?.[classId] || [3, 3];

      for (let gIdx = 0; gIdx < guestList.length; gIdx++) {
        const gLvl = guestLevels[gIdx] && guestLevels[gIdx] >= 1 && guestLevels[gIdx] <= 5 ? guestLevels[gIdx] : 3;
        participants.push({
          key: `${enr.studentId}-guest-${gIdx}`,
          name: guestList[gIdx],
          isGuest: true,
          guestOf: studentName,
          guestIndex: gIdx,
          studentId: enr.studentId,
          level: gLvl,
          enrolledIndex: count++,
        });
      }
    }

    return participants;
  };

  const handleAdminUpdateParticipantLevel = async (
    classId: string,
    participant: Participant,
    newLevel: number
  ) => {
    const clampedLevel = Math.max(1, Math.min(5, Math.round(newLevel)));
    const className = classes.find(c => c.id === classId)?.name || 'Turma';

    // Immediate visual feedback flash
    setUpdatedFlashKey(participant.key);
    setTimeout(() => {
      setUpdatedFlashKey(prev => prev === participant.key ? null : prev);
    }, 1500);

    try {
      const enrollment = enrollments.find(e => e.studentId === participant.studentId);
      if (!enrollment) return;

      if (participant.isGuest) {
        if (participant.guestIndex !== undefined) {
          const gIdx = participant.guestIndex ?? 0;
          const currentGuestLevels = { ...(enrollment.guestLevels || {}) };
          const classGLevels = [...(currentGuestLevels[classId] || [3, 3])];
          while (classGLevels.length <= gIdx) classGLevels.push(3);
          classGLevels[gIdx] = clampedLevel;
          currentGuestLevels[classId] = classGLevels;

          // Instant local update
          setEnrollments(prev => prev.map(e => e.studentId === participant.studentId ? {
            ...e,
            guestLevels: currentGuestLevels
          } : e));

          await setDoc(doc(db, "enrollments", participant.studentId), {
            guestLevels: currentGuestLevels,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } else {
          // Direct guest added by admin
          const currentClassLevels = { ...(enrollment.classLevels || {}) };
          currentClassLevels[classId] = clampedLevel;

          setEnrollments(prev => prev.map(e => e.studentId === participant.studentId ? {
            ...e,
            classLevels: currentClassLevels,
            skillLevel: clampedLevel
          } : e));

          await setDoc(doc(db, "enrollments", participant.studentId), {
            classLevels: currentClassLevels,
            skillLevel: clampedLevel,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }

        await addDoc(collection(db, "activity_logs"), {
          studentName: 'Professor (Admin)',
          action: 'changed',
          details: `Definiu nível do convidado "${participant.name}" para ${clampedLevel}★ (${'⭐'.repeat(clampedLevel)}) na turma ${className}`,
          timestamp: serverTimestamp()
        });
      } else {
        const currentClassLevels = { ...(enrollment.classLevels || {}) };
        currentClassLevels[classId] = clampedLevel;

        // Instant local update
        setEnrollments(prev => prev.map(e => e.studentId === participant.studentId ? {
          ...e,
          classLevels: currentClassLevels,
          skillLevel: clampedLevel
        } : e));

        const updatedStudents = students.map(s => s.id === participant.studentId ? {
          ...s,
          classLevels: { ...(s.classLevels || {}), [classId]: clampedLevel },
          skillLevel: clampedLevel
        } : s);
        setStudents(updatedStudents);

        await setDoc(doc(db, "enrollments", participant.studentId), {
          classLevels: currentClassLevels,
          skillLevel: clampedLevel,
          updatedAt: serverTimestamp()
        }, { merge: true });

        await setDoc(doc(db, "config", "settings"), {
          students: updatedStudents,
          updatedAt: serverTimestamp()
        }, { merge: true });

        await addDoc(collection(db, "activity_logs"), {
          studentName: 'Professor (Admin)',
          action: 'changed',
          details: `Definiu nível de "${participant.name}" para ${clampedLevel}★ (${'⭐'.repeat(clampedLevel)}) na turma ${className}`,
          timestamp: serverTimestamp()
        });
      }

      // Synchronize active team draw if one already exists
      if (savedDraws[classId]) {
        const draw = savedDraws[classId];
        let changed = false;
        const updatedTeams = draw.teams.map(team => {
          const pIdx = team.players.findIndex(p => p.key === participant.key);
          if (pIdx !== -1) {
            changed = true;
            const updatedPlayers = [...team.players];
            updatedPlayers[pIdx] = { ...updatedPlayers[pIdx], level: clampedLevel };
            const totalStars = updatedPlayers.reduce((acc, p) => acc + (p.level || 3), 0);
            return {
              ...team,
              players: updatedPlayers,
              totalStars,
              averageStars: Number((totalStars / updatedPlayers.length).toFixed(1))
            };
          }
          return team;
        });

        const updatedWaitlist = draw.waitlist.map(p => {
          if (p.key === participant.key) {
            changed = true;
            return { ...p, level: clampedLevel };
          }
          return p;
        });

        if (changed) {
          const updatedDraw: DrawResult = {
            ...draw,
            teams: updatedTeams,
            waitlist: updatedWaitlist
          };
          setSavedDraws(prev => ({ ...prev, [classId]: updatedDraw }));
          await setDoc(doc(db, "config", "settings"), {
            teamDraws: { ...savedDraws, [classId]: updatedDraw },
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      }
    } catch (err) {
      console.error("Erro ao atualizar estrelas pelo professor", err);
    }
  };

  // =========================================================================
  // ESPORTE NO SÁBADO HANDLERS
  // =========================================================================
  const handleSaturdayAddStudentToClass = async (studentId: string, classId: string) => {
    const st = students.find(s => s.id === studentId);
    const studentName = st?.name || 'Aluno';
    const className = classes.find(c => c.id === classId)?.name || 'Turma';
    const existingEnrollment = enrollments.find(e => e.studentId === studentId);

    const currentClasses = existingEnrollment ? existingEnrollment.classes : [];
    if (currentClasses.includes(classId)) return;

    const newClasses = [...currentClasses, classId];
    const studentLevel = existingEnrollment?.skillLevel || st?.skillLevel || 3;
    const currentClassLevels = { ...(existingEnrollment?.classLevels || {}), [classId]: studentLevel };

    // Optimistic UI update
    setEnrollments(prev => {
      const exists = prev.some(e => e.studentId === studentId);
      if (exists) {
        return prev.map(e => e.studentId === studentId ? { ...e, classes: newClasses, classLevels: currentClassLevels } : e);
      }
      return [...prev, {
        studentId,
        studentName,
        classes: newClasses,
        classLevels: currentClassLevels,
        skillLevel: studentLevel,
        updatedAt: Date.now(),
        justifiedAbsence: false,
        absenceReason: ''
      }];
    });

    try {
      await setDoc(doc(db, "enrollments", studentId), {
        classes: newClasses,
        classLevels: currentClassLevels,
        skillLevel: studentLevel,
        studentName,
        justifiedAbsence: false,
        absenceReason: null,
        updatedAt: serverTimestamp()
      }, { merge: true });

      await addDoc(collection(db, "activity_logs"), {
        studentName: 'Professor (Admin)',
        action: 'enrolled',
        details: `Incluiu ${studentName} na turma ${className} (Esporte no Sábado)`,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error("Erro ao incluir aluno no sábado", err);
    }
  };

  const handleSaturdayAddMultipleStudentsToClass = async (studentIds: string[], classId: string) => {
    const className = classes.find(c => c.id === classId)?.name || 'Turma';

    // Optimistic updates
    setEnrollments(prev => {
      const next = [...prev];
      for (const sId of studentIds) {
        const st = students.find(s => s.id === sId);
        const sName = st?.name || 'Aluno';
        const existingIdx = next.findIndex(e => e.studentId === sId);
        const sLevel = st?.skillLevel || 3;

        if (existingIdx !== -1) {
          const current = next[existingIdx];
          if (!current.classes.includes(classId)) {
            next[existingIdx] = {
              ...current,
              classes: [...current.classes, classId],
              classLevels: { ...(current.classLevels || {}), [classId]: sLevel }
            };
          }
        } else {
          next.push({
            studentId: sId,
            studentName: sName,
            classes: [classId],
            classLevels: { [classId]: sLevel },
            skillLevel: sLevel,
            updatedAt: Date.now(),
            justifiedAbsence: false,
            absenceReason: ''
          });
        }
      }
      return next;
    });

    try {
      const promises = studentIds.map(async (sId) => {
        const st = students.find(s => s.id === sId);
        const sName = st?.name || 'Aluno';
        const existing = enrollments.find(e => e.studentId === sId);
        const currentClasses = existing ? existing.classes : [];
        if (currentClasses.includes(classId)) return;

        const newClasses = [...currentClasses, classId];
        const sLevel = existing?.skillLevel || st?.skillLevel || 3;
        const currentClassLevels = { ...(existing?.classLevels || {}), [classId]: sLevel };

        await setDoc(doc(db, "enrollments", sId), {
          classes: newClasses,
          classLevels: currentClassLevels,
          skillLevel: sLevel,
          studentName: sName,
          justifiedAbsence: false,
          absenceReason: null,
          updatedAt: serverTimestamp()
        }, { merge: true });
      });

      await Promise.all(promises);

      await addDoc(collection(db, "activity_logs"), {
        studentName: 'Professor (Admin)',
        action: 'enrolled',
        details: `Incluiu ${studentIds.length} alunos na turma ${className} (Esporte no Sábado)`,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error("Erro ao incluir múltiplos alunos no sábado", err);
    }
  };

  const handleSaturdayRemoveParticipantFromClass = async (participant: Participant, classId: string) => {
    const className = classes.find(c => c.id === classId)?.name || 'Turma';

    try {
      if (participant.studentId.startsWith('guest_admin_')) {
        // Direct guest created by admin
        const existing = enrollments.find(e => e.studentId === participant.studentId);
        if (existing) {
          const updatedClasses = existing.classes.filter(c => c !== classId);
          if (updatedClasses.length === 0) {
            await deleteDoc(doc(db, "enrollments", participant.studentId));
            setEnrollments(prev => prev.filter(e => e.studentId !== participant.studentId));
          } else {
            await setDoc(doc(db, "enrollments", participant.studentId), {
              classes: updatedClasses,
              updatedAt: serverTimestamp()
            }, { merge: true });
            setEnrollments(prev => prev.map(e => e.studentId === participant.studentId ? { ...e, classes: updatedClasses } : e));
          }
        }
      } else if (participant.isGuest && participant.guestIndex !== undefined) {
        // Student guest
        const existing = enrollments.find(e => e.studentId === participant.studentId);
        if (existing && existing.guests?.[classId]) {
          const newGuests = [...existing.guests[classId]];
          newGuests.splice(participant.guestIndex, 1);
          const newGuestMap = { ...existing.guests, [classId]: newGuests };
          await setDoc(doc(db, "enrollments", participant.studentId), {
            guests: newGuestMap,
            updatedAt: serverTimestamp()
          }, { merge: true });
          setEnrollments(prev => prev.map(e => e.studentId === participant.studentId ? { ...e, guests: newGuestMap } : e));
        }
      } else {
        // Regular student
        const existing = enrollments.find(e => e.studentId === participant.studentId);
        if (existing) {
          const newClasses = existing.classes.filter(c => c !== classId);
          await setDoc(doc(db, "enrollments", participant.studentId), {
            classes: newClasses,
            updatedAt: serverTimestamp()
          }, { merge: true });
          setEnrollments(prev => prev.map(e => e.studentId === participant.studentId ? { ...e, classes: newClasses } : e));
        }
      }

      await addDoc(collection(db, "activity_logs"), {
        studentName: 'Professor (Admin)',
        action: 'unenrolled',
        details: `Removeu "${participant.name}" da turma ${className} (Esporte no Sábado)`,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error("Erro ao remover participante no sábado", err);
    }
  };

  const handleSaturdayAddGuestToClass = async (classId: string, guestName: string, guestLevel: number) => {
    const className = classes.find(c => c.id === classId)?.name || 'Turma';
    const guestDocId = `guest_admin_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const clampedLevel = Math.max(1, Math.min(5, Math.round(guestLevel || 3)));

    const newRecord: EnrollmentRecord = {
      studentId: guestDocId,
      studentName: guestName.trim(),
      isGuest: true,
      guestOf: 'Admin',
      classes: [classId],
      classLevels: { [classId]: clampedLevel },
      skillLevel: clampedLevel,
      updatedAt: Date.now(),
      justifiedAbsence: false,
      absenceReason: ''
    };

    // Optimistic update
    setEnrollments(prev => [...prev, newRecord]);

    try {
      await setDoc(doc(db, "enrollments", guestDocId), {
        studentId: guestDocId,
        studentName: guestName.trim(),
        isGuest: true,
        guestOf: 'Admin',
        classes: [classId],
        classLevels: { [classId]: clampedLevel },
        skillLevel: clampedLevel,
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, "activity_logs"), {
        studentName: 'Professor (Admin)',
        action: 'enrolled',
        details: `Incluiu convidado "${guestName.trim()}" (${clampedLevel}★) na turma ${className} (Esporte no Sábado)`,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error("Erro ao adicionar convidado no sábado", err);
    }
  };

  const handleAdminSetStudentLevel = async (studentId: string, level: number) => {
    const clamped = Math.max(1, Math.min(5, Math.round(level)));
    const updatedStudents = students.map(s => s.id === studentId ? {
      ...s,
      skillLevel: clamped
    } : s);
    setStudents(updatedStudents);

    // Also update existing enrollment if present
    const enrollment = enrollments.find(e => e.studentId === studentId);
    if (enrollment) {
      setEnrollments(prev => prev.map(e => e.studentId === studentId ? { ...e, skillLevel: clamped } : e));
      try {
        await setDoc(doc(db, "enrollments", studentId), {
          skillLevel: clamped,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.error("Erro ao atualizar enrollment", err);
      }
    }

    saveConfig(updatedStudents, classes);

    const studentName = students.find(s => s.id === studentId)?.name || 'Aluno';
    try {
      await addDoc(collection(db, "activity_logs"), {
        studentName: 'Professor (Admin)',
        action: 'changed',
        details: `Definiu nível de "${studentName}" para ${clamped}★ (${'⭐'.repeat(clamped)})`,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error("Erro ao registrar log de nível", err);
    }
  };

  const handleSaveNotice = async (textToSave?: string) => {
    const value = textToSave !== undefined ? textToSave : notice;
    setIsSavingNotice(true);
    try {
      await setDoc(doc(db, "config", "settings"), {
        notice: value,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setNoticeSavedSuccess(true);
      setTimeout(() => setNoticeSavedSuccess(false), 3000);
    } catch (e) {
      console.error("Erro ao salvar aviso no Firebase", e);
    } finally {
      setIsSavingNotice(false);
    }
  };

  const handleSetActiveDay = async (dayToSave: ClassDay) => {
    const cleanDay = (dayToSave || '').trim().toUpperCase();
    if (!cleanDay) return;
    setActiveDay(cleanDay);
    try {
      localStorage.setItem('tsunami_active_day', cleanDay);
    } catch {
      // ignore
    }
    setIsSavingDay(true);
    try {
      await setDoc(doc(db, "config", "settings"), {
        activeDay: cleanDay,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setDaySavedSuccess(true);
      setTimeout(() => setDaySavedSuccess(false), 2500);

      await addDoc(collection(db, "activity_logs"), {
        studentName: 'Organização',
        action: 'changed',
        details: `Alterou o dia ativo da agenda para: ${cleanDay}`,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error("Erro ao salvar dia ativo no Firebase", e);
    } finally {
      setIsSavingDay(false);
    }
  };

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      setLogoUrl(base64String);
      try {
        await setDoc(doc(db, "config", "settings"), {
          logoUrl: base64String,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.error("Erro ao salvar logo", err);
      }
    };
    reader.readAsDataURL(file);
  };

  const totalStudents = students.length;

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    if (password === 'admin123') {
      setIsAdmin(true);
      try {
        sessionStorage.setItem('tsunami_admin_auth', 'true');
      } catch {}
      setView('adminPanel');
      setPassword('');
      setError('');
    } else {
      setError('Senha incorreta.');
    }
  };

  const handleQuickAdminLogin = (e: FormEvent) => {
    e.preventDefault();
    if (quickAdminPassword === 'admin123') {
      setIsAdmin(true);
      try {
        sessionStorage.setItem('tsunami_admin_auth', 'true');
      } catch {}
      setAdminQuickLoginOpen(false);
      setQuickAdminPassword('');
      setQuickAdminError('');
    } else {
      setQuickAdminError('Senha incorreta.');
    }
  };

  const handleAdminLogout = () => {
    setIsAdmin(false);
    try {
      sessionStorage.removeItem('tsunami_admin_auth');
    } catch {}
    setView('home');
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
      const enrollmentsSnapshot = await getDocs(collection(db, "enrollments"));
      const deleteEnrollmentsPromises = enrollmentsSnapshot.docs.map(docSnap => deleteDoc(doc(db, "enrollments", docSnap.id)));
      await Promise.all(deleteEnrollmentsPromises);

      const logsSnapshot = await getDocs(collection(db, "activity_logs"));
      const deleteLogsPromises = logsSnapshot.docs.map(docSnap => deleteDoc(doc(db, "activity_logs", docSnap.id)));
      await Promise.all(deleteLogsPromises);
    } catch (e) {
      console.error("Erro ao resetar inscrições e logs no Firebase", e);
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

  const toggleStudentAllowedClass = (studentId: string, classId: string) => {
    const newStudents = students.map(s => {
      if (s.id === studentId) {
        let currentAllowed = s.allowedClasses;
        if (!currentAllowed) {
          currentAllowed = classes.map(c => c.id);
        }
        const newAllowed = currentAllowed.includes(classId) 
          ? currentAllowed.filter(id => id !== classId)
          : [...currentAllowed, classId];
        return { ...s, allowedClasses: newAllowed };
      }
      return s;
    });
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
    setSelectedGuests({});
    setSelectedGuestLevels({});
    setSelectedStudentLevel(3);
    setSelectedStudentLevels({});
    setEnrollmentSubTab('classes');
    setGuestClassId('');
    setStudentFlowError('');
    setView('studentFlow');
  };

  const startJustificationFlow = () => {
    setJustificationStep(1);
    setSelectedStudentId(null);
    setStudentPasswordInput('');
    setStudentSearchInput('');
    setAbsenceReason('');
    setStudentFlowError('');
    setView('justificationFlow');
  };

  const handleSelectStudent = (id: string, flow: 'enrollment' | 'justification' = 'enrollment') => {
    const student = students.find(s => s.id === id);
    if (!student) return;
    if (!student.isAllowed) {
      setStudentFlowError('Você não tem permissão para acessar no momento.');
      return;
    }
    setStudentFlowError('');
    setSelectedStudentId(id);
    if (flow === 'justification') {
      setJustificationStep(2);
    } else {
      setStudentStep(2);
    }
  };

  const handleValidatePassword = (flow: 'enrollment' | 'justification' = 'enrollment') => {
    const student = students.find(s => s.id === selectedStudentId);
    if (!student) return;
    if (student.password === studentPasswordInput) {
      setStudentFlowError('');
      const existingEnrollment = enrollments.find(e => e.studentId === student.id);
      
      if (flow === 'justification') {
        setAbsenceReason(existingEnrollment?.absenceReason || '');
        setJustificationStep(3);
      } else {
        setSelectedClasses(existingEnrollment ? existingEnrollment.classes : []);
        const loadedGuests: Record<string, string[]> = {};
        const loadedGuestLevels: Record<string, number[]> = {};
        if (existingEnrollment?.guests) {
          for (const [cId, gList] of Object.entries(existingEnrollment.guests)) {
            if (Array.isArray(gList)) {
              loadedGuests[cId] = [...gList];
            }
          }
        }
        if (existingEnrollment?.guestLevels) {
          for (const [cId, lList] of Object.entries(existingEnrollment.guestLevels)) {
            if (Array.isArray(lList)) {
              loadedGuestLevels[cId] = [...lList];
            }
          }
        }
        setSelectedGuests(loadedGuests);
        setSelectedGuestLevels(loadedGuestLevels);
        const loadedClassLevels: Record<string, number> = {};
        if (existingEnrollment?.classLevels) {
          for (const [cId, lvl] of Object.entries(existingEnrollment.classLevels)) {
            if (typeof lvl === 'number') loadedClassLevels[cId] = lvl;
          }
        } else if (student?.classLevels) {
          for (const [cId, lvl] of Object.entries(student.classLevels)) {
            if (typeof lvl === 'number') loadedClassLevels[cId] = lvl;
          }
        }
        setSelectedStudentLevels(loadedClassLevels);
        setSelectedStudentLevel(existingEnrollment?.skillLevel || student?.skillLevel || 3);
        setEnrollmentSubTab('classes');
        const availableList = classes.filter(c => c.isOpen && (!student?.allowedClasses || student.allowedClasses.includes(c.id)));
        if (availableList.length > 0) {
          setGuestClassId(existingEnrollment?.classes?.[0] || availableList[0].id);
        }
        setStudentStep(3);
      }
    } else {
      setStudentFlowError('Senha incorreta.');
    }
  };

  const handleStudentClassLevelChange = (classId: string, level: number) => {
    setSelectedStudentLevels(prev => ({
      ...prev,
      [classId]: level
    }));
  };

  const handleGuestChange = (classId: string, index: number, value: string) => {
    setSelectedGuests(prev => {
      const current = prev[classId] ? [...prev[classId]] : ['', ''];
      while (current.length < 2) current.push('');
      current[index] = value;
      return { ...prev, [classId]: current };
    });
  };

  const handleGuestLevelChange = (classId: string, index: number, level: number) => {
    setSelectedGuestLevels(prev => {
      const current = prev[classId] ? [...prev[classId]] : [3, 3];
      while (current.length < 2) current.push(3);
      current[index] = level;
      return { ...prev, [classId]: current };
    });
  };

  const toggleStudentClass = (classId: string) => {
    setSelectedClasses(prev => {
      const willInclude = !prev.includes(classId);
      if (willInclude) {
        return [...prev, classId];
      } else {
        return prev.filter(id => id !== classId);
      }
    });
  };

  const handleFinishEnrollment = async () => {
    if (!selectedStudentId) return;

    try {
      const student = students.find(s => s.id === selectedStudentId);
      const studentName = student?.name || 'Aluno Desconhecido';
      const existingEnrollment = enrollments.find(e => e.studentId === selectedStudentId);
      const existingClasses = existingEnrollment ? existingEnrollment.classes : [];
      
      let action: 'enrolled' | 'unenrolled' | 'changed' = 'changed';
      let details = '';

      // Clean guests: only keep valid non-empty guests for each class (max 2 per class)
      // Levels for guests are preserved from what the professor set, or default to 3
      const cleanedGuests: Record<string, string[]> = {};
      const preservedGuestLevels: Record<string, number[]> = {};
      let totalGuestsCount = 0;
      const guestDetailsSummary: string[] = [];

      for (const [classId, rawList] of Object.entries(selectedGuests)) {
        const list: string[] = [];
        const levels: number[] = [];
        const existingGLevels = existingEnrollment?.guestLevels?.[classId] || [3, 3];

        const rawArray = ((rawList as string[]) || []).slice(0, 2);
        rawArray.forEach((rawName, i) => {
          const trimmed = (rawName || '').trim();
          if (trimmed.length > 0) {
            list.push(trimmed);
            // Preserve level assigned by professor if exists, else default to 3
            const lvl = existingGLevels[i] && existingGLevels[i] >= 1 && existingGLevels[i] <= 5 ? existingGLevels[i] : 3;
            levels.push(lvl);
          }
        });
        
        if (list.length > 0) {
          cleanedGuests[classId] = list;
          preservedGuestLevels[classId] = levels;
          totalGuestsCount += list.length;
          const cName = classes.find(c => c.id === classId)?.name || 'Turma';
          guestDetailsSummary.push(`${cName}: ${list.join(', ')}`);
        }
      }

      // Preserve student levels assigned exclusively by the professor
      const preservedClassLevels: Record<string, number> = {
        ...(student?.classLevels || {}),
        ...(existingEnrollment?.classLevels || {})
      };
      const assignedBaseLevel = student?.skillLevel || existingEnrollment?.skillLevel || 3;

      for (const cid of selectedClasses) {
        if (!preservedClassLevels[cid]) {
          preservedClassLevels[cid] = assignedBaseLevel;
        }
      }

      const classNamesStr = selectedClasses.map(cid => {
        return classes.find(c => c.id === cid)?.name || 'Turma';
      }).join(', ');

      const hadPrevious = existingClasses.length > 0 || (existingEnrollment?.guests && Object.keys(existingEnrollment.guests).length > 0);
      const hasCurrent = selectedClasses.length > 0 || totalGuestsCount > 0;

      if (!hasCurrent && hadPrevious) {
        action = 'unenrolled';
        details = 'Cancelou a inscrição e convidados em todas as turmas.';
      } else if (!hadPrevious && hasCurrent) {
        action = 'enrolled';
        details = classNamesStr ? `Inscreveu-se em: ${classNamesStr}` : `Cadastrou convidados`;
        if (totalGuestsCount > 0) {
          details += ` (+ ${totalGuestsCount} ${totalGuestsCount === 1 ? 'convidado' : 'convidados'}: ${guestDetailsSummary.join('; ')})`;
        }
      } else if (hasCurrent) {
        action = 'changed';
        details = classNamesStr ? `Alterou inscrição para: ${classNamesStr}` : `Alterou convidados`;
        if (totalGuestsCount > 0) {
          details += ` (+ ${totalGuestsCount} ${totalGuestsCount === 1 ? 'convidado' : 'convidados'}: ${guestDetailsSummary.join('; ')})`;
        }
      } else {
        action = 'changed';
        details = 'Salvou a inscrição vazia.';
      }

      await setDoc(doc(db, "enrollments", selectedStudentId), {
        classes: selectedClasses,
        classLevels: preservedClassLevels,
        guests: cleanedGuests,
        guestLevels: preservedGuestLevels,
        skillLevel: assignedBaseLevel,
        justifiedAbsence: false,
        absenceReason: null,
        updatedAt: serverTimestamp()
      });

      // Add to activity logs
      await addDoc(collection(db, "activity_logs"), {
        studentName,
        action,
        details,
        timestamp: serverTimestamp()
      });

      setView('home');
    } catch (e) {
      console.error("Erro ao salvar inscrições", e);
      setStudentFlowError('Erro ao salvar. Tente novamente.');
    }
  };

  const handleFinishJustification = async () => {
    if (!selectedStudentId) return;

    if (absenceReason.trim() === '') {
      setStudentFlowError('Por favor, escreva a justificativa da sua ausência.');
      return;
    }

    try {
      const student = students.find(s => s.id === selectedStudentId);
      const studentName = student?.name || 'Aluno Desconhecido';
      
      await setDoc(doc(db, "enrollments", selectedStudentId), {
        classes: [],
        justifiedAbsence: true,
        absenceReason: absenceReason.trim(),
        updatedAt: serverTimestamp()
      });

      // Add to activity logs
      await addDoc(collection(db, "activity_logs"), {
        studentName,
        action: 'justified',
        details: `Justificou ausência: ${absenceReason.trim()}`,
        timestamp: serverTimestamp()
      });

      setView('home');
    } catch (e) {
      console.error("Erro ao salvar justificativa", e);
      setStudentFlowError('Erro ao salvar. Tente novamente.');
    }
  };

  const pageTransition = {
    initial: { opacity: 0, y: 15 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -15 },
    transition: { duration: 0.3 }
  };

  const openClassesCount = classes.filter(c => c.isOpen).length;
  const totalCapacityCount = classes.filter(c => c.isOpen).reduce((acc, c) => acc + c.multiplier * 5, 0);
  const totalEnrolledCount = classes.filter(c => c.isOpen).reduce((acc, c) => acc + getClassParticipants(c.id).length, 0);

  return (
    <div className="min-h-screen bg-[#050913] text-slate-100 overflow-x-hidden selection:bg-cyan-400 selection:text-slate-950 font-sans relative">
      {/* Ambient background glows */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 -right-32 w-[30rem] h-[30rem] bg-blue-600/10 rounded-full blur-[140px]" />
        <div className="absolute -bottom-32 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[140px]" />
      </div>

      <AnimatePresence mode="wait">
        
        {/* =========================================================================
            ADMIN LOGIN VIEW
        ========================================================================= */}
        {view === 'adminLogin' && (
          <motion.div key="adminLogin" {...pageTransition} className="min-h-screen flex items-center justify-center p-6 relative z-10">
            <div className="w-full max-w-md glass-panel rounded-3xl p-8 md:p-10 shadow-2xl relative overflow-hidden border border-white/10">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500" />
              
              <button 
                onClick={() => { setView('home'); setError(''); setPassword(''); }}
                className="inline-flex items-center gap-2 text-slate-400 hover:text-cyan-300 transition-colors mb-8 text-xs font-bold uppercase tracking-wider group"
              >
                <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" /> Voltar ao Início
              </button>
              
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-cyan-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.25)]">
                  <ShieldCheck className="w-8 h-8 text-cyan-400" />
                </div>
                <span className="text-[11px] font-black uppercase tracking-widest text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-3 py-1 rounded-full inline-block mb-3">
                  Autenticação da Organização
                </span>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white uppercase">Acesso Restrito</h1>
                <p className="text-slate-400 text-sm mt-1">Digite sua senha de administrador para gerenciar o Projeto Tsunami.</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Senha do administrador"
                      autoFocus
                      className="w-full bg-slate-950/80 border border-slate-700/70 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 rounded-2xl pl-11 pr-4 py-4 text-white text-center tracking-widest text-sm focus:outline-none transition-all placeholder:tracking-normal placeholder:text-slate-600"
                    />
                  </div>
                  {error && <p className="text-rose-400 text-xs font-bold text-center mt-3 bg-rose-500/10 border border-rose-500/20 py-2 rounded-xl">{error}</p>}
                </div>
                <button 
                  type="submit"
                  className="w-full bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-slate-950 font-black text-sm uppercase tracking-widest py-4 rounded-2xl transition-all shadow-[0_4px_20px_0_rgba(6,182,212,0.4)] hover:-translate-y-0.5 active:translate-y-0 cursor-pointer flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" /> Entrar no Painel
                </button>
              </form>
            </div>
          </motion.div>
        )}

        {/* =========================================================================
            ADMIN PANEL VIEW
        ========================================================================= */}
        {view === 'adminPanel' && (
          <motion.div key="adminPanel" {...pageTransition} className="min-h-screen p-4 md:p-8 relative z-10">
            <div className="max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Header (Left) - Cockpit */}
              <div className="lg:col-span-8 glass-panel rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden border border-white/10 flex flex-col justify-between">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-400 via-teal-400 to-amber-400" />
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="text-cyan-400 text-xs font-black uppercase tracking-widest">Painel Administrativo & Gestão</span>
                  </div>
                  <h1 className="text-2xl md:text-4xl font-black text-white tracking-tight mb-2 uppercase flex items-center gap-3">
                    Gestão Tsunami
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 uppercase tracking-wider">PRO</span>
                  </h1>
                  <p className="text-slate-400 text-sm md:text-base mb-6 max-w-2xl leading-relaxed">
                    Controle de turmas, vagas, permissões e sorteador de linhas de alta precisão.
                  </p>
                </div>

                {/* Primary Action Buttons */}
                <div className="flex flex-wrap gap-3 pt-2">
                  <button 
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-75 disabled:cursor-wait text-slate-950 font-black text-xs md:text-sm uppercase tracking-wider py-3.5 px-5 rounded-2xl flex items-center gap-2 transition-all shadow-[0_4px_18px_0_rgba(16,185,129,0.35)] hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} /> 
                    {isSyncing ? 'Sincronizando...' : 'Sincronizar Planilha'}
                  </button>

                  <button 
                    onClick={toggleEnrollmentsLocked}
                    className={`font-black text-xs md:text-sm uppercase tracking-wider py-3.5 px-5 rounded-2xl flex items-center gap-2 transition-all cursor-pointer ${
                      enrollmentsLocked 
                        ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-[0_4px_18px_0_rgba(245,158,11,0.4)]' 
                        : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/70'
                    }`}
                  >
                    <Lock className="w-4 h-4" /> 
                    {enrollmentsLocked ? 'Desbloquear Inscrições' : 'Trancar Inscrições'}
                  </button>

                  <button 
                    onClick={() => setSaturdaySportOpen(true)}
                    className="bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-black text-xs md:text-sm uppercase tracking-wider py-3.5 px-6 rounded-2xl flex items-center gap-2 transition-all shadow-[0_4px_20px_0_rgba(245,158,11,0.45)] hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                    title="Inclusão direta de alunos e convidados para o sábado"
                  >
                    <span className="text-base">⚽</span> ESPORTE NO SÁBADO
                  </button>

                  <button 
                    onClick={() => {
                      const firstCls = classes.find(c => c.isOpen) || classes[0];
                      if (firstCls) setActiveDrawClassId(firstCls.id);
                    }}
                    className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs md:text-sm uppercase tracking-wider py-3.5 px-5 rounded-2xl flex items-center gap-2 transition-all shadow-[0_4px_18px_0_rgba(6,182,212,0.4)] hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                  >
                    <Shuffle className="w-4 h-4" /> Sorteador de Linhas
                  </button>

                  <button 
                    onClick={handleReset}
                    className="bg-rose-950/40 border border-rose-900/60 hover:bg-rose-900/50 hover:border-rose-600 text-rose-300 font-bold text-xs md:text-sm uppercase tracking-wider py-3.5 px-5 rounded-2xl flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" /> Resetar Inscrições
                  </button>
                </div>
              </div>

              {/* Header (Right) - Stats & Mode Switch */}
              <div className="lg:col-span-4 glass-panel rounded-3xl p-6 md:p-8 flex flex-col justify-between shadow-2xl border border-white/10 relative overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/10">
                  <button 
                    onClick={() => setView('home')} 
                    className="bg-amber-400/15 hover:bg-amber-400/25 text-amber-300 border border-amber-400/40 hover:border-amber-400/60 font-black text-xs uppercase tracking-wider px-3.5 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-sm cursor-pointer"
                    title="Ver Página Inicial com o Modo Professor Ativo para alterar níveis dos alunos"
                  >
                    <span>👀 Ver Página Inicial</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleAdminLogout} 
                      className="w-10 h-10 bg-slate-800/80 rounded-xl flex items-center justify-center hover:bg-rose-950/60 hover:text-rose-400 text-slate-400 transition-colors border border-slate-700/70 hover:border-rose-800 cursor-pointer"
                      title="Sair do Modo Administrador"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                    <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Sair</span>
                  </div>
                </div>

                {/* Modern Metrics Grid */}
                <div className="grid grid-cols-2 gap-3 mt-6">
                  <div className="bg-slate-950/60 border border-white/5 rounded-2xl p-4 flex flex-col">
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1 flex items-center gap-1.5">
                      <Users className="w-3 h-3 text-cyan-400" /> Alunos Base
                    </span>
                    <div className="text-cyan-400 text-3xl md:text-4xl font-black tracking-tight leading-none mt-auto">
                      {totalStudents}
                    </div>
                  </div>

                  <div className="bg-slate-950/60 border border-white/5 rounded-2xl p-4 flex flex-col">
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1 flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-emerald-400" /> Turmas Abertas
                    </span>
                    <div className="text-emerald-400 text-3xl md:text-4xl font-black tracking-tight leading-none mt-auto">
                      {openClassesCount} <span className="text-xs text-slate-500 font-bold">/ {classes.length}</span>
                    </div>
                  </div>

                  <div className="col-span-2 bg-gradient-to-r from-slate-950/80 via-slate-900/60 to-slate-950/80 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest block mb-1">
                        Inscritos na Semana
                      </span>
                      <span className="text-white font-black text-xl">
                        {totalEnrolledCount} <span className="text-slate-400 text-xs font-bold">de {totalCapacityCount} vagas</span>
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                        {totalCapacityCount > 0 ? Math.round((totalEnrolledCount / totalCapacityCount) * 100) : 0}% Ocupado
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Left Column (Turmas) */}
              <div className="lg:col-span-7 space-y-6">
                <div className="flex justify-between items-center px-1 mt-4 lg:mt-0">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-6 bg-cyan-400 rounded-full shadow-[0_0_12px_rgba(6,182,212,0.6)]" />
                    <h2 className="text-lg md:text-xl font-black text-white tracking-tight uppercase">Turmas & Modalidades</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      type="button"
                      onClick={() => setSaturdaySportOpen(true)}
                      className="h-10 px-3.5 bg-amber-400/15 hover:bg-amber-400/25 text-amber-300 hover:border-amber-400/60 border border-amber-400/35 rounded-xl flex items-center justify-center gap-1.5 transition-all text-xs font-black uppercase tracking-wider shadow-sm cursor-pointer"
                    >
                      <span>⚽</span> ESPORTE NO SÁBADO
                    </button>
                    <button onClick={addClass} className="h-10 px-4 bg-slate-800/90 hover:bg-cyan-500/20 text-slate-200 hover:text-cyan-300 hover:border-cyan-500/40 border border-slate-700/80 rounded-xl flex items-center justify-center gap-2 transition-all text-xs font-bold uppercase tracking-wider cursor-pointer">
                      <Plus className="w-4 h-4" /> Nova Turma
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {classes.map(cls => (
                    <motion.div layout key={cls.id} className="glass-panel rounded-3xl p-6 shadow-xl border border-white/10 relative overflow-hidden transition-all hover:border-cyan-500/30">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-4 gap-4">
                        <div className="flex-1">
                          <input 
                            type="text"
                            value={cls.name}
                            onChange={(e) => updateClassName(cls.id, e.target.value)}
                            className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-cyan-400 focus:outline-none text-xl md:text-2xl font-black text-white uppercase tracking-tight w-full px-0 py-1 transition-colors"
                            placeholder="NOME DA TURMA"
                          />
                        </div>
                        <button 
                          onClick={() => toggleClassStatus(cls.id)}
                          className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 cursor-pointer ${
                            cls.isOpen 
                              ? 'bg-emerald-400 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.35)]' 
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {cls.isOpen ? 'Ativa / Aberta' : 'Fechada'}
                        </button>
                      </div>
                      
                      <input 
                        type="text"
                        value={cls.description}
                        onChange={(e) => updateClassDescription(cls.id, e.target.value)}
                        className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-cyan-400 focus:outline-none text-slate-400 hover:text-slate-200 focus:text-slate-100 text-sm mb-6 w-full px-0 py-1 transition-colors"
                        placeholder="Ex: Horário a definir... quinta até 12h"
                      />
                      
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6 bg-slate-950/50 p-3.5 rounded-2xl border border-white/5">
                        <span className="text-slate-400 text-[11px] font-black uppercase tracking-wider shrink-0">
                          Multiplicador (x5 vagas):
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                            <button 
                              key={num}
                              onClick={() => setMultiplier(cls.id, num)}
                              className={`w-8 h-8 rounded-xl text-xs font-black flex items-center justify-center transition-all cursor-pointer ${
                                cls.multiplier === num 
                                  ? 'bg-cyan-400 text-slate-950 shadow-[0_0_12px_rgba(6,182,212,0.45)]' 
                                  : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-white'
                              }`}
                            >
                              {num}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex justify-between items-center border-t border-white/10 pt-4 mt-2">
                        <div className="flex items-center gap-2">
                          <span className="text-cyan-400 text-sm font-black tracking-wide">
                            {cls.multiplier * 5} VAGAS TOTAIS
                          </span>
                          {(() => {
                            let count = 0;
                            enrollments.filter(e => e.classes.includes(cls.id) && !e.justifiedAbsence).forEach(e => {
                              count += 1;
                              const gList = (e.guests?.[cls.id] || []).filter(g => g.trim().length > 0).slice(0, 2);
                              count += gList.length;
                            });
                            return (
                              <span className="text-[11px] font-bold text-slate-300 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-white/10">
                                {count} inscritos
                              </span>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            type="button"
                            onClick={() => setActiveDrawClassId(cls.id)}
                            className="bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 hover:border-cyan-500/50 font-black text-xs uppercase tracking-wider px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <Shuffle className="w-3.5 h-3.5 text-cyan-400" />
                            {savedDraws[cls.id] ? `Linhas (${savedDraws[cls.id].teams.length} times)` : 'Sortear'}
                          </button>
                          <button 
                            onClick={() => removeClass(cls.id)}
                            className="text-rose-400 hover:text-rose-300 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1 px-2.5 py-2 rounded-xl hover:bg-rose-950/40 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Excluir
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Right Column (Configs & Students) */}
              <div className="lg:col-span-5 space-y-6">
                
                {/* Configs Card */}
                <div className="glass-panel rounded-3xl p-6 shadow-xl border border-white/10">
                  <div className="mb-6 flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                          Dia da Semana (Agenda Ativa)
                        </h3>
                        {daySavedSuccess && (
                          <span className="text-[10px] text-emerald-300 font-bold bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-400" /> Salvo no sistema!
                          </span>
                        )}
                      </div>
                      
                      {/* Seleção rápida de dia da semana */}
                      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 mb-3">
                        {AVAILABLE_DAYS.map(day => (
                          <button 
                            key={day}
                            type="button"
                            onClick={() => handleSetActiveDay(day)}
                            disabled={isSavingDay}
                            className={`py-2 px-1 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all text-center border cursor-pointer ${
                              activeDay === day 
                                ? 'bg-cyan-400 text-slate-950 border-cyan-300 shadow-[0_0_14px_rgba(6,182,212,0.45)] scale-[1.02]' 
                                : 'bg-slate-900/80 text-slate-300 border-white/10 hover:bg-slate-800 hover:text-white'
                            }`}
                          >
                            {day}
                          </button>
                        ))}
                      </div>

                      {/* Campo customizado */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={activeDay}
                          onChange={(e) => setActiveDay(e.target.value.toUpperCase())}
                          placeholder="Ou digite o dia/horário..."
                          maxLength={35}
                          className="flex-1 bg-slate-950/80 border border-slate-700/80 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/20 rounded-xl px-3.5 py-2.5 text-xs text-white uppercase placeholder:normal-case placeholder:text-slate-500 focus:outline-none transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => handleSetActiveDay(activeDay)}
                          disabled={isSavingDay}
                          className="px-4 py-2.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all shrink-0 flex items-center gap-1.5 shadow-[0_2px_10px_rgba(6,182,212,0.3)] cursor-pointer"
                        >
                          <Save className="w-3.5 h-3.5" /> Salvar
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-2.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                        Dia ativo na página inicial: <strong className="text-cyan-300 uppercase tracking-wide">{activeDay}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="mb-6 pt-4 border-t border-white/10">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
                      <Trophy className="w-3.5 h-3.5 text-amber-400" />
                      Logo do Projeto
                    </h3>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-slate-950 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                        {logoUrl ? (
                          <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-cyan-400 text-[11px] font-black uppercase tracking-widest">SEM LOGO</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <label className="cursor-pointer bg-slate-800/90 hover:bg-slate-700 text-slate-200 font-black text-xs uppercase tracking-wider py-2.5 px-4 rounded-xl transition-all inline-block text-center border border-white/10 hover:border-cyan-500/30 w-full shadow-sm">
                          Alterar Imagem da Logo
                          <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                        </label>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1.5 text-center md:text-left">
                          Formatos aceitos: JPG, PNG, WEBP
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mb-6 pt-4 border-t border-white/10">
                    <div className="flex justify-between items-center mb-3">
                       <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                         <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                         Justificativa de Ausência
                       </h3>
                    </div>
                    <button 
                      onClick={toggleAbsenceJustification}
                      className={`w-full font-black text-xs uppercase tracking-wider py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        absenceJustificationOpen 
                          ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950 shadow-[0_4px_14px_0_rgba(16,185,129,0.35)]' 
                          : 'bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-white/10'
                      }`}
                    >
                      {absenceJustificationOpen ? '✓ Botão de Justificar: ABERTO' : '✕ Botão de Justificar: FECHADO'}
                    </button>
                    <p className="text-[11px] text-slate-400 mt-2 text-center">Permite que o aluno avise e justifique que não vai poder treinar</p>
                  </div>
                  
                  <div className="pt-4 border-t border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                        Quadro de Avisos da Página Inicial
                      </h3>
                      {noticeSavedSuccess && (
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> Salvo!
                        </span>
                      )}
                    </div>
                    <textarea 
                      id="admin-notice-input"
                      value={notice}
                      onFocus={() => { isEditingNoticeRef.current = true; }}
                      onChange={(e) => {
                        setNotice(e.target.value);
                        setNoticeSavedSuccess(false);
                      }}
                      onBlur={() => {
                        isEditingNoticeRef.current = false;
                        handleSaveNotice(notice);
                      }}
                      placeholder="Digite o aviso para os alunos..."
                      className="w-full bg-slate-950/80 border border-white/10 rounded-2xl p-4 text-sm text-cyan-100 placeholder:text-slate-600 resize-none h-28 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all leading-relaxed"
                    />
                    <button
                      id="save-notice-btn"
                      type="button"
                      onClick={() => handleSaveNotice(notice)}
                      disabled={isSavingNotice}
                      className={`mt-2 w-full font-black text-xs uppercase tracking-wider py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        noticeSavedSuccess
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-[0_4px_14px_0_rgba(6,182,212,0.35)]'
                      }`}
                    >
                      {isSavingNotice ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Salvando aviso...
                        </>
                      ) : noticeSavedSuccess ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          Aviso Salvo com Sucesso!
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          Salvar Quadro de Avisos
                        </>
                      )}
                    </button>
                    <p className="text-[10px] text-slate-400 mt-2 text-center">
                      Salva automaticamente ao sair do campo ou clicando no botão acima
                    </p>
                  </div>
                </div>

                {/* Justificativas Recebidas */}
                <div className="glass-panel rounded-3xl p-6 shadow-xl border border-white/10">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-5 bg-rose-400 rounded-full shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
                    <h3 className="text-base md:text-lg font-black text-white tracking-tight uppercase">Justificativas de Ausência</h3>
                  </div>
                  
                  <div className="space-y-3 max-h-[350px] overflow-y-auto custom-scrollbar pr-2">
                    {(() => {
                      const justifiedEnrollments = enrollments
                        .filter(e => e.justifiedAbsence)
                        .sort((a, b) => b.updatedAt - a.updatedAt);
                        
                      if (justifiedEnrollments.length === 0) {
                        return (
                          <div className="text-center py-8 bg-slate-950/60 rounded-2xl border border-white/5">
                            <p className="text-slate-400 text-xs uppercase tracking-wider font-bold">Nenhuma ausência justificada até o momento.</p>
                          </div>
                        );
                      }
                      
                      return justifiedEnrollments.map(enrollment => {
                        const st = students.find(s => s.id === enrollment.studentId);
                        return (
                          <div key={enrollment.studentId} className="bg-slate-950/70 border border-rose-500/25 p-4 rounded-2xl flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                              <span className="text-rose-200 text-xs md:text-sm font-black uppercase tracking-wider">
                                {st?.name || 'Aluno Desconhecido'}
                              </span>
                            </div>
                            <p className="text-rose-300 text-sm font-medium bg-rose-950/40 p-3 rounded-xl border border-rose-500/20 leading-relaxed">
                              {enrollment.absenceReason || 'Nenhuma justificativa escrita.'}
                            </p>
                            <span className="text-[10px] text-slate-400 font-mono text-right">
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
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-5 bg-emerald-400 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                      <h3 className="text-base md:text-lg font-black text-white tracking-tight uppercase">Controle de Alunos & Acessos</h3>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <button onClick={allowAllStudents} className="flex-1 sm:flex-none px-3.5 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all text-center cursor-pointer">
                        Liberar Todos
                      </button>
                      <button onClick={blockAllStudents} className="flex-1 sm:flex-none px-3.5 py-2 bg-rose-950/40 hover:bg-rose-900/40 text-rose-300 border border-rose-900/50 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all text-center cursor-pointer">
                        Bloquear Todos
                      </button>
                    </div>
                  </div>
                  
                  <div className="relative mb-5 shrink-0">
                    <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Pesquisar aluno por nome..." 
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      className="w-full bg-slate-950/80 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-400 transition-colors"
                    />
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                    {students.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-4">
                        <p className="text-sm">Nenhum aluno sincronizado ainda.</p>
                      </div>
                    ) : (
                      filteredStudents.map(student => (
                        <div key={student.id} className={`border rounded-2xl p-4 flex flex-col gap-3 transition-colors ${student.isAllowed ? 'bg-slate-950/70 border-white/10 hover:border-cyan-500/30' : 'bg-rose-950/20 border-rose-900/40'}`}>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <h4 className={`font-black text-sm tracking-tight uppercase line-clamp-1 ${student.isAllowed ? 'text-white' : 'text-rose-300/60'}`} title={student.name}>
                                  {student.name}
                                </h4>
                                
                                {/* 1-Click Star Selector for Professor */}
                                <div className="flex items-center gap-1 bg-slate-900/90 border border-amber-400/30 px-2 py-0.5 rounded-lg w-fit">
                                  <span className="text-[9px] font-black uppercase text-amber-400 mr-0.5">
                                    Nível:
                                  </span>
                                  <div className="flex items-center gap-0.5">
                                    {([1, 2, 3, 4, 5] as const).map(starNum => {
                                      const currentLevel = student.skillLevel || 3;
                                      const isSelected = starNum <= currentLevel;
                                      return (
                                        <button
                                          key={starNum}
                                          type="button"
                                          onClick={() => handleAdminSetStudentLevel(student.id, starNum)}
                                          title={`Definir nível do aluno para ${starNum} estrelas`}
                                          className={`text-xs leading-none transition-transform hover:scale-125 active:scale-95 p-0.5 cursor-pointer ${
                                            isSelected
                                              ? 'opacity-100 drop-shadow-[0_0_4px_rgba(250,204,21,0.6)]'
                                              : 'opacity-25 hover:opacity-75 grayscale'
                                          }`}
                                        >
                                          ⭐
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <span className="text-[10px] font-mono text-amber-300 font-bold ml-1">
                                    {student.skillLevel || 3}★
                                  </span>
                                </div>
                              </div>
                              <p className="text-slate-400 text-[10px] mt-1 font-mono">SENHA: {student.password}</p>
                            </div>
                            <div className="flex bg-slate-900 rounded-xl p-1 gap-1 shrink-0 border border-white/10">
                              <button 
                                onClick={() => toggleStudentAllowed(student.id, true)}
                                className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer ${student.isAllowed ? 'bg-emerald-400 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                              >
                                Liberar
                              </button>
                              <button 
                                onClick={() => toggleStudentAllowed(student.id, false)}
                                className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer ${!student.isAllowed ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                              >
                                Bloquear
                              </button>
                            </div>
                          </div>
                          
                          {student.isAllowed && (
                            <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
                              <p className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Turmas Permitidas:</p>
                              <div className="flex flex-wrap gap-1.5">
                                {classes.map(c => {
                                   const isChecked = student.allowedClasses ? student.allowedClasses.includes(c.id) : true;
                                   return (
                                     <button 
                                       key={c.id} 
                                       onClick={() => toggleStudentAllowedClass(student.id, c.id)}
                                       className={`px-2.5 py-1 border rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer ${isChecked ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-900 text-slate-500 border-white/5'}`}
                                     >
                                       <div className={`w-3 h-3 rounded-sm flex items-center justify-center border ${isChecked ? 'bg-emerald-400 border-emerald-400' : 'border-slate-600'}`}>
                                         {isChecked && <Check className="w-2 h-2 text-slate-950 font-bold" />}
                                       </div>
                                       {c.name}
                                     </button>
                                   );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Avaliação de Comportamento */}
                <div className="glass-panel rounded-3xl p-6 flex flex-col h-[600px] shadow-xl border border-white/10">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-5 bg-amber-400 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                    <h3 className="text-base md:text-lg font-black text-white tracking-tight uppercase">Avaliação de Conduta & Punições</h3>
                  </div>

                  <div className="relative mb-4 shrink-0">
                    <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Pesquisar aluno por nome..." 
                      value={behaviorSearchInput}
                      onChange={(e) => setBehaviorSearchInput(e.target.value)}
                      className="w-full bg-slate-950/80 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm text-white focus:outline-none focus:border-amber-400 transition-colors"
                    />
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                    {students.filter(s => s.isAllowed && s.name.toLowerCase().includes(behaviorSearchInput.toLowerCase())).map(student => (
                      <div key={student.id} className="border border-white/10 rounded-2xl p-4 bg-slate-950/70 flex flex-col gap-3">
                        <div className="flex justify-between items-center cursor-pointer" onClick={() => setSelectedBehaviorStudentId(selectedBehaviorStudentId === student.id ? null : student.id)}>
                          <h4 className="font-black text-sm tracking-tight uppercase text-white line-clamp-1">{student.name}</h4>
                          <div className={`px-3 py-1 rounded-xl text-xs font-black ${(student.behaviorScore ?? 10) >= 7 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : (student.behaviorScore ?? 10) >= 4 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}`}>
                            Nota: {student.behaviorScore ?? 10}
                          </div>
                        </div>

                        {selectedBehaviorStudentId === student.id && (
                          <div className="pt-3 border-t border-white/10 mt-1 flex flex-col gap-2">
                            <p className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Aplicar Penalidade:</p>
                            <div className="flex flex-wrap gap-1.5">
                              <button onClick={() => handleApplyBehaviorPenalty(student.id, 1, 'Conversando')} className="px-3 py-1.5 bg-slate-900 hover:bg-rose-950/50 text-slate-300 hover:text-rose-300 border border-white/10 hover:border-rose-900/50 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer">-1 Conversando</button>
                              <button onClick={() => handleApplyBehaviorPenalty(student.id, 2, 'Conversando Muito')} className="px-3 py-1.5 bg-slate-900 hover:bg-rose-950/50 text-slate-300 hover:text-rose-300 border border-white/10 hover:border-rose-900/50 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer">-2 Conversando Muito</button>
                              <button onClick={() => handleApplyBehaviorPenalty(student.id, 1, 'Brincadeira')} className="px-3 py-1.5 bg-slate-900 hover:bg-rose-950/50 text-slate-300 hover:text-rose-300 border border-white/10 hover:border-rose-900/50 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer">-1 Brincadeira</button>
                              <button onClick={() => handleApplyBehaviorPenalty(student.id, 2, 'Celular')} className="px-3 py-1.5 bg-slate-900 hover:bg-rose-950/50 text-slate-300 hover:text-rose-300 border border-white/10 hover:border-rose-900/50 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer">-2 Celular</button>
                              <button onClick={() => handleApplyBehaviorPenalty(student.id, 1, 'Sem Atenção')} className="px-3 py-1.5 bg-slate-900 hover:bg-rose-950/50 text-slate-300 hover:text-rose-300 border border-white/10 hover:border-rose-900/50 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer">-1 Sem Atenção</button>
                            </div>
                            
                            {student.infractions && student.infractions.length > 0 && (
                               <div className="mt-2 p-3 bg-rose-950/30 border border-rose-500/25 rounded-2xl">
                                 <p className="text-[10px] uppercase font-black text-rose-300 tracking-wider mb-1.5">Histórico de Punições:</p>
                                 <p className="text-[11px] text-rose-200/90 mb-3">{student.infractions.join(', ')}</p>
                                 <button onClick={() => handleResetBehavior(student.id)} className="w-full px-3 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer">
                                   Restaurar Nota 10
                                 </button>
                               </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Activity Logs (Full Width) */}
              <div className="lg:col-span-12 glass-panel rounded-3xl p-6 md:p-8 shadow-2xl border border-white/10 mt-2">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-1.5 h-6 bg-purple-400 rounded-full shadow-[0_0_12px_rgba(168,85,247,0.6)]" />
                  <h2 className="text-lg md:text-xl font-black text-white tracking-tight uppercase flex items-center gap-2">
                    <Activity className="w-5 h-5 text-purple-400" />
                    Histórico & Auditoria de Atividades
                  </h2>
                </div>
                
                {activityLogs.length === 0 ? (
                  <div className="text-center py-8 bg-slate-950/60 rounded-2xl border border-white/5">
                    <p className="text-slate-400 text-sm uppercase tracking-wider font-bold">Nenhuma atividade recente registrada.</p>
                  </div>
                ) : (
                  <div className="bg-slate-950/70 rounded-2xl border border-white/10 p-4 md:p-6 space-y-3">
                    {activityLogs.map(log => {
                      const date = new Date(log.timestamp);
                      const dateString = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                      const timeString = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                      
                      let badgeColor = 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
                      let badgeLabel = 'AÇÃO';

                      if (log.action === 'enrolled') {
                        badgeColor = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
                        badgeLabel = 'INSCRIÇÃO';
                      } else if (log.action === 'unenrolled') {
                        badgeColor = 'bg-rose-500/15 text-rose-300 border-rose-500/30';
                        badgeLabel = 'CANCELOU';
                      } else if (log.action === 'changed') {
                        badgeColor = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
                        badgeLabel = 'ALTEROU';
                      } else if (log.action === 'justified') {
                        badgeColor = 'bg-purple-500/15 text-purple-300 border-purple-500/30';
                        badgeLabel = 'JUSTIFICOU';
                      }

                      return (
                        <div key={log.id} className="text-xs md:text-sm font-medium text-slate-300 border-b border-white/5 pb-3 last:border-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${badgeColor} shrink-0`}>
                              {badgeLabel}
                            </span>
                            <span className="font-black text-white">{log.studentName}</span>
                            <span className="text-slate-400">— {log.details}</span>
                          </div>
                          <span className="text-[11px] font-mono text-slate-500 shrink-0">
                            {timeString} · {dateString}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </motion.div>
        )}

        {/* =========================================================================
            STUDENT FLOW VIEW
        ========================================================================= */}
        {view === 'studentFlow' && (
          <motion.div key="studentFlow" {...pageTransition} className="min-h-screen flex flex-col items-center justify-center p-4 relative z-10">
            
            {studentStep === 1 && (
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-lg flex flex-col items-center">
                <div className="text-center mb-6">
                  <span className="inline-block px-3.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 text-[10px] font-black tracking-widest uppercase mb-3">
                    Passo 01 de 03 • Identificação
                  </span>
                  <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-white">Quem é você?</h1>
                  <p className="text-slate-400 text-sm mt-1">Busque e selecione seu nome na lista oficial do Projeto Tsunami.</p>
                </div>
                
                <div className="w-full glass-panel rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col border border-white/10">
                  <div className="relative mb-5 shrink-0">
                    <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Digite seu nome para buscar..." 
                      value={studentSearchInput}
                      onChange={(e) => setStudentSearchInput(e.target.value)}
                      autoFocus
                      className="w-full bg-slate-950/80 border border-white/10 rounded-2xl pl-12 pr-10 py-3.5 text-base text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors"
                    />
                    {studentSearchInput && (
                      <button 
                        type="button" 
                        onClick={() => setStudentSearchInput('')}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  
                  {studentFlowError && <p className="text-rose-400 text-xs font-bold text-center mb-4 p-2 bg-rose-500/10 border border-rose-500/20 rounded-xl">{studentFlowError}</p>}
                  
                  <div className="flex-1 max-h-[360px] overflow-y-auto custom-scrollbar pr-2 space-y-2">
                    {students
                      .filter(s => s.isAllowed && s.name.toLowerCase().includes(studentSearchInput.toLowerCase()))
                      .map(s => (
                      <button 
                        key={s.id}
                        onClick={() => handleSelectStudent(s.id)}
                        className="w-full text-left bg-slate-950/60 hover:bg-cyan-500/10 border border-white/5 hover:border-cyan-500/40 rounded-2xl p-4 transition-all hover:translate-x-1 flex items-center justify-between group cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-black text-xs flex items-center justify-center shrink-0 uppercase">
                            {s.name.charAt(0)}
                          </div>
                          <span className="text-sm font-black uppercase tracking-tight text-slate-200 group-hover:text-white">{s.name}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-cyan-400 transition-colors" />
                      </button>
                    ))}
                    {students.filter(s => s.isAllowed && s.name.toLowerCase().includes(studentSearchInput.toLowerCase())).length === 0 && (
                       <p className="text-center text-slate-400 text-sm py-8">Nenhum atleta encontrado com este nome.</p>
                    )}
                  </div>
                </div>

                <button 
                  onClick={() => setView('home')}
                  className="mt-6 text-slate-400 hover:text-rose-400 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" /> Cancelar e Voltar ao Início
                </button>
              </motion.div>
            )}

            {studentStep === 2 && (
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-lg flex flex-col items-center">
                <div className="text-center mb-6">
                  <span className="inline-block px-3.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 text-[10px] font-black tracking-widest uppercase mb-3">
                    Passo 02 de 03 • Confirmação
                  </span>
                  <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-white">Sua Senha</h1>
                  <div className="inline-block px-4 py-2 bg-slate-900/80 border border-cyan-500/30 rounded-2xl mt-2">
                    <p className="text-cyan-300 text-xs md:text-sm uppercase font-black tracking-wider">
                      {students.find(s => s.id === selectedStudentId)?.name}
                    </p>
                  </div>
                </div>
                
                <div className="w-full glass-panel rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col gap-6 border border-white/10">
                  <div>
                    <input 
                      type="password"
                      value={studentPasswordInput}
                      onChange={(e) => setStudentPasswordInput(e.target.value)}
                      placeholder="DIGITE SUA SENHA"
                      autoFocus
                      className="w-full bg-slate-950/80 border border-white/10 rounded-2xl px-6 py-4 text-center text-lg font-black tracking-widest uppercase text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors placeholder:text-slate-600 placeholder:tracking-normal"
                    />
                    {studentFlowError && <p className="text-rose-400 text-xs font-bold text-center mt-3 bg-rose-500/10 border border-rose-500/20 py-2 rounded-xl">{studentFlowError}</p>}
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button 
                      onClick={() => setStudentStep(1)}
                      className="flex-1 bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-black text-xs md:text-sm uppercase tracking-wider py-4 rounded-2xl transition-all cursor-pointer"
                    >
                      Voltar
                    </button>
                    <button 
                      onClick={() => handleValidatePassword('enrollment')}
                      className="flex-1 bg-gradient-to-r from-cyan-400 to-sky-500 hover:from-cyan-300 hover:to-sky-400 text-slate-950 font-black text-xs md:text-sm uppercase tracking-wider py-4 rounded-2xl transition-all shadow-[0_4px_16px_0_rgba(6,182,212,0.35)] cursor-pointer"
                    >
                      Validar Senha
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {studentStep === 3 && (
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-xl flex flex-col items-center">
                <div className="text-center mb-6">
                  <span className="inline-block px-3.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-black tracking-widest uppercase mb-3">
                    Passo Final • Escolha suas Atividades
                  </span>
                  <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white">Inscrição & Convidados</h1>
                  <div className="inline-block px-4 py-1.5 bg-slate-900/80 border border-cyan-500/30 rounded-2xl mt-1.5">
                    <p className="text-cyan-300 text-xs uppercase font-black tracking-wider">
                      {students.find(s => s.id === selectedStudentId)?.name}
                    </p>
                  </div>
                </div>
                
                <div className="w-full glass-panel rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col border border-white/10">
                  {(() => {
                    const student = students.find(s => s.id === selectedStudentId);
                    const studentName = student?.name || 'Aluno';
                    const availableClasses = classes.filter(c => c.isOpen && (!student?.allowedClasses || student.allowedClasses.includes(c.id)));
                    
                    let totalGuestsCount = 0;
                    Object.values(selectedGuests).forEach(list => {
                      totalGuestsCount += ((list as string[]) || []).filter(g => (g || '').trim().length > 0).slice(0, 2).length;
                    });

                    const activeGuestClass = availableClasses.find(c => c.id === guestClassId) || availableClasses[0];

                    if (availableClasses.length === 0) {
                      return (
                        <div className="text-center py-10 bg-slate-950/60 rounded-2xl border border-white/5">
                          <p className="text-slate-400 text-sm uppercase tracking-wider font-bold">Nenhuma turma aberta para inscrição no momento.</p>
                        </div>
                      );
                    }

                    return (
                      <>
                        {/* AVISO: NÍVEL DEFINIDO EXCLUSIVAMENTE PELO PROFESSOR */}
                        <div className="bg-slate-950/80 border border-cyan-500/30 rounded-2xl p-4 mb-5 shadow-lg flex items-start gap-3.5">
                          <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 flex items-center justify-center text-xl shrink-0">
                            ⭐
                          </div>
                          <div className="flex-1">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                              <span className="text-xs font-black uppercase tracking-wider text-cyan-300">
                                Nível & Equilíbrio de Times
                              </span>
                              <span className="text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md w-fit">
                                Avaliado pelo Professor
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              O nível de jogo é definido pelo <strong className="text-white">Professor</strong> para garantir sorteios justos e equilibrados em cada turma.
                            </p>
                            {(() => {
                              const existingLevel = student?.skillLevel || enrollments.find(e => e.studentId === selectedStudentId)?.skillLevel;
                              if (existingLevel) {
                                return (
                                  <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center gap-2">
                                    <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">
                                      Seu nível atribuído:
                                    </span>
                                    <span className="text-xs font-mono text-amber-300 font-bold bg-slate-900 border border-amber-500/30 px-2.5 py-0.5 rounded-lg">
                                      {getSkillStars(existingLevel)} ({existingLevel}★)
                                    </span>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>

                        {/* Selector Tabs: Turmas vs Inserir Convidado */}
                        <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-950/80 rounded-2xl border border-white/10 mb-6">
                          <button
                            type="button"
                            onClick={() => setEnrollmentSubTab('classes')}
                            className={`py-3 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                              enrollmentSubTab === 'classes'
                                ? 'bg-emerald-400 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.35)]'
                                : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
                            }`}
                          >
                            <span>Minhas Turmas</span>
                            {selectedClasses.length > 0 && (
                              <span className="bg-slate-950 text-emerald-300 text-[10px] px-2 py-0.5 rounded-full font-bold">
                                {selectedClasses.length}
                              </span>
                            )}
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => {
                              setEnrollmentSubTab('guests');
                              if (!guestClassId && availableClasses.length > 0) {
                                setGuestClassId(selectedClasses[0] || availableClasses[0].id);
                              }
                            }}
                            className={`py-3 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                              enrollmentSubTab === 'guests'
                                ? 'bg-amber-400 text-slate-950 shadow-[0_0_15px_rgba(245,158,11,0.35)]'
                                : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
                            }`}
                          >
                            <Users className="w-3.5 h-3.5" />
                            <span>Inserir Convidado</span>
                            {totalGuestsCount > 0 && (
                              <span className="bg-slate-950 text-amber-300 text-[10px] px-2 py-0.5 rounded-full font-bold">
                                {totalGuestsCount}
                              </span>
                            )}
                          </button>
                        </div>

                        {/* SUBTAB 1: TURMAS */}
                        {enrollmentSubTab === 'classes' && (
                          <div className="flex-1 max-h-[380px] overflow-y-auto custom-scrollbar pr-2 space-y-3 mb-6">
                            <p className="text-xs text-slate-400 mb-3">
                              Marque as turmas em que você vai participar esta semana:
                            </p>
                            {availableClasses.map(c => {
                              const isSelected = selectedClasses.includes(c.id);
                              const classGuests = (selectedGuests[c.id] || []).filter(g => g.trim().length > 0).slice(0, 2);

                              return (
                                <div 
                                  key={c.id} 
                                  className={`rounded-2xl transition-all border p-4 md:p-5 ${
                                    isSelected 
                                      ? 'bg-emerald-500/10 border-emerald-400 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.18)]' 
                                      : 'bg-slate-950/60 border-white/10 hover:border-white/20 text-slate-300'
                                  }`}
                                >
                                  <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleStudentClass(c.id)}>
                                    <div>
                                      <span className="text-sm md:text-base font-black uppercase tracking-tight">
                                        {c.name}
                                      </span>
                                      <p className={`text-xs mt-1 ${isSelected ? 'text-emerald-400/80' : 'text-slate-400'}`}>
                                        {c.description}
                                      </p>
                                    </div>
                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                                      isSelected ? 'bg-emerald-400 border-emerald-400' : 'border-slate-600'
                                    }`}>
                                      {isSelected && <Check className="w-3.5 h-3.5 text-slate-950 font-bold" />}
                                    </div>
                                  </div>

                                  <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setGuestClassId(c.id);
                                        setEnrollmentSubTab('guests');
                                      }}
                                      className="text-[11px] font-bold text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1.5 uppercase tracking-wide cursor-pointer"
                                    >
                                      <Users className="w-3.5 h-3.5" />
                                      {classGuests.length > 0 ? `+ Gerenciar convidados (${classGuests.length})` : '+ Inserir Convidado nesta turma'}
                                    </button>
                                    {isSelected && (
                                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-md border border-emerald-500/30">
                                        Você inscrito
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* SUBTAB 2: INSERIR CONVIDADO */}
                        {enrollmentSubTab === 'guests' && (
                          <div className="flex-1 max-h-[380px] overflow-y-auto custom-scrollbar pr-2 space-y-4 mb-6">
                            <div>
                              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-2">
                                1. Selecione a turma do convidado:
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {availableClasses.map(c => {
                                  const isCurrent = (activeGuestClass?.id === c.id);
                                  const cGuests = (selectedGuests[c.id] || []).filter(g => g.trim().length > 0).slice(0, 2);
                                  return (
                                    <button
                                      key={c.id}
                                      type="button"
                                      onClick={() => setGuestClassId(c.id)}
                                      className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border cursor-pointer ${
                                        isCurrent
                                          ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.35)]'
                                          : 'bg-slate-950/70 text-slate-300 border-white/10 hover:border-white/20'
                                      }`}
                                    >
                                      <span>{c.name}</span>
                                      {cGuests.length > 0 && (
                                        <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-bold ${
                                          isCurrent ? 'bg-slate-950 text-amber-300' : 'bg-amber-500/20 text-amber-300'
                                        }`}>
                                          {cGuests.length}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {activeGuestClass && (
                              <div className="bg-slate-950/80 border border-amber-400/30 rounded-2xl p-4 md:p-5 shadow-lg space-y-4">
                                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                                  <div>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block">
                                      Turma do Convidado:
                                    </span>
                                    <h4 className="text-base md:text-lg font-black text-white uppercase tracking-tight">
                                      {activeGuestClass.name}
                                    </h4>
                                  </div>
                                  <span className="text-[10px] font-black text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 rounded-lg uppercase tracking-wider shrink-0">
                                    Máx. 2 convidados
                                  </span>
                                </div>

                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                  Insira os convidados para <strong className="text-white">{activeGuestClass.name}</strong>. Na lista oficial, eles aparecerão como <strong className="text-amber-300 font-bold">(CONVIDADO DE {studentName})</strong>.
                                </p>

                                <div className="space-y-4">
                                  {/* Convidado 1 */}
                                  <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-300">
                                      1º Convidado:
                                    </label>
                                    <div className="flex items-center gap-2">
                                      <input 
                                        type="text"
                                        placeholder="Nome do 1º convidado (opcional)"
                                        value={selectedGuests[activeGuestClass.id]?.[0] || ''}
                                        onChange={(e) => handleGuestChange(activeGuestClass.id, 0, e.target.value)}
                                        maxLength={50}
                                        className="w-full bg-slate-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white uppercase placeholder:normal-case placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
                                      />
                                      {selectedGuests[activeGuestClass.id]?.[0] && (
                                        <button
                                          type="button"
                                          onClick={() => handleGuestChange(activeGuestClass.id, 0, '')}
                                          className="text-slate-500 hover:text-rose-400 p-2 rounded-lg transition-colors shrink-0"
                                          title="Limpar nome"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>

                                    {selectedGuests[activeGuestClass.id]?.[0]?.trim() && (
                                      <div className="text-[10px] text-amber-300/90 font-medium bg-amber-500/10 border border-amber-500/25 rounded-xl p-2.5 mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                                      <span>
                                          Aparecerá na lista: <strong className="text-amber-200 uppercase">{selectedGuests[activeGuestClass.id][0].trim()} (CONVIDADO DE {studentName})</strong>
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Convidado 2 */}
                                  <div className="space-y-2 pt-3 border-t border-white/10">
                                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-300">
                                      2º Convidado:
                                    </label>
                                    <div className="flex items-center gap-2">
                                      <input 
                                        type="text"
                                        placeholder="Nome do 2º convidado (opcional)"
                                        value={selectedGuests[activeGuestClass.id]?.[1] || ''}
                                        onChange={(e) => handleGuestChange(activeGuestClass.id, 1, e.target.value)}
                                        maxLength={50}
                                        className="w-full bg-slate-900 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white uppercase placeholder:normal-case placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
                                      />
                                      {selectedGuests[activeGuestClass.id]?.[1] && (
                                        <button
                                          type="button"
                                          onClick={() => handleGuestChange(activeGuestClass.id, 1, '')}
                                          className="text-slate-500 hover:text-rose-400 p-2 rounded-lg transition-colors shrink-0"
                                          title="Limpar nome"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>

                                    {selectedGuests[activeGuestClass.id]?.[1]?.trim() && (
                                      <div className="text-[10px] text-amber-300/90 font-medium bg-amber-500/10 border border-amber-500/25 rounded-xl p-2.5 mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                                        <span>
                                          Aparecerá na lista: <strong className="text-amber-200 uppercase">{selectedGuests[activeGuestClass.id][1].trim()} (CONVIDADO DE {studentName})</strong>
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Summary of selections */}
                        <div className="bg-slate-950/70 rounded-2xl p-4 mb-4 border border-white/10 text-xs text-slate-400 flex flex-col gap-2">
                          <div className="flex justify-between items-center">
                            <span>Turmas selecionadas:</span>
                            <strong className="text-emerald-400 uppercase">
                              {selectedClasses.length > 0 
                                ? selectedClasses.map(cid => classes.find(c => c.id === cid)?.name).filter(Boolean).join(", ")
                                : "Nenhuma"}
                            </strong>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Convidados inseridos:</span>
                            <strong className="text-amber-400">
                              {totalGuestsCount > 0 ? `${totalGuestsCount} convidado(s)` : "Nenhum"}
                            </strong>
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  {studentFlowError && <p className="text-rose-400 text-xs font-bold text-center mb-4 bg-rose-500/10 border border-rose-500/20 py-2 rounded-xl">{studentFlowError}</p>}

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button 
                      onClick={() => setStudentStep(2)}
                      className="sm:w-1/3 bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-black text-xs md:text-sm uppercase tracking-wider py-4 rounded-2xl transition-all cursor-pointer"
                    >
                      Voltar
                    </button>
                    <button 
                      onClick={handleFinishEnrollment}
                      className="sm:w-2/3 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-slate-950 font-black text-xs md:text-sm uppercase tracking-wider py-4 rounded-2xl transition-all shadow-[0_4px_20px_0_rgba(16,185,129,0.35)] cursor-pointer"
                    >
                      Concluir Inscrição ✓
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* =========================================================================
            JUSTIFICATION FLOW VIEW
        ========================================================================= */}
        {view === 'justificationFlow' && (
          <motion.div key="justificationFlow" {...pageTransition} className="min-h-screen flex items-center justify-center p-4 md:p-6 relative z-10">
            {justificationStep === 1 && (
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-lg flex flex-col items-center">
                <div className="text-center mb-6">
                  <span className="inline-block px-3.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[10px] font-black tracking-widest uppercase mb-3">
                    Passo 01 de 03 • Ausência
                  </span>
                  <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-white">Justificar Falta</h1>
                  <p className="text-slate-400 text-sm mt-1">Selecione seu nome para enviar sua justificativa à organização.</p>
                </div>
                
                <div className="w-full glass-panel rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col border border-white/10">
                  <div className="relative mb-5 shrink-0">
                    <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input 
                      type="text"
                      placeholder="Pesquise seu nome..."
                      value={studentSearchInput}
                      onChange={(e) => setStudentSearchInput(e.target.value)}
                      autoFocus
                      className="w-full bg-slate-950/80 border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold uppercase text-white focus:outline-none focus:border-rose-400 transition-colors"
                    />
                  </div>

                  <div className="flex-1 max-h-[350px] overflow-y-auto custom-scrollbar pr-2 space-y-2">
                    {students.filter(s => s.isAllowed && s.name.toLowerCase().includes(studentSearchInput.toLowerCase())).map(s => (
                      <button 
                        key={s.id}
                        onClick={() => handleSelectStudent(s.id, 'justification')}
                        className="w-full text-left bg-slate-950/60 hover:bg-rose-950/30 border border-white/5 hover:border-rose-500/40 rounded-2xl p-4 transition-all hover:translate-x-1 flex items-center justify-between cursor-pointer"
                      >
                        <span className="text-sm font-black uppercase tracking-tight text-slate-200">{s.name}</span>
                        <ChevronRight className="w-4 h-4 text-slate-600" />
                      </button>
                    ))}
                    {students.filter(s => s.isAllowed && s.name.toLowerCase().includes(studentSearchInput.toLowerCase())).length === 0 && (
                       <p className="text-center text-slate-400 text-sm py-8">Nenhum atleta encontrado.</p>
                    )}
                  </div>
                  {studentFlowError && <p className="text-rose-400 text-xs font-bold text-center mt-4 bg-rose-500/10 border border-rose-500/20 py-2 rounded-xl">{studentFlowError}</p>}
                </div>

                <button 
                  onClick={() => setView('home')}
                  className="mt-8 text-slate-500 hover:text-rose-400 text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" /> Cancelar e Voltar
                </button>
              </motion.div>
            )}

            {justificationStep === 2 && (
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-lg flex flex-col items-center">
                <div className="text-center mb-8">
                  <span className="inline-block px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-black tracking-widest uppercase mb-4">Passo 02 de 03</span>
                  <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-4 text-white">Segurança</h1>
                  <div className="inline-block px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-xl">
                    <p className="text-rose-300 text-xs md:text-sm uppercase font-black tracking-widest">
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
                      className="w-full bg-slate-950/60 border border-slate-700/50 rounded-2xl px-6 py-4 text-center text-lg font-black tracking-widest uppercase text-white focus:outline-none focus:border-rose-500 transition-colors"
                    />
                    {studentFlowError && <p className="text-rose-400 text-xs font-bold text-center mt-3 bg-rose-500/10 py-2 rounded-lg">{studentFlowError}</p>}
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3 mt-2">
                    <button 
                      onClick={() => setJustificationStep(1)}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-xs md:text-sm uppercase tracking-widest py-4 rounded-2xl transition-colors"
                    >
                      Voltar
                    </button>
                    <button 
                      onClick={() => handleValidatePassword('justification')}
                      className="flex-1 bg-gradient-to-r from-rose-500 to-rose-400 hover:from-rose-400 hover:to-rose-300 text-slate-950 font-black text-xs md:text-sm uppercase tracking-widest py-4 rounded-2xl transition-all shadow-[0_4px_14px_0_rgba(244,63,94,0.39)]"
                    >
                      Validar Senha
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {justificationStep === 3 && (
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-lg flex flex-col items-center">
                <div className="text-center mb-8">
                  <span className="inline-block px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-black tracking-widest uppercase mb-4">Passo Final</span>
                  <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-2 text-white">Motivo</h1>
                  <p className="text-slate-400 text-sm">Escreva por que você não poderá treinar.</p>
                </div>
                
                <div className="w-full bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-[2rem] p-6 md:p-8 shadow-2xl flex flex-col">
                  <div className="mb-6">
                    <textarea 
                      placeholder="Escreva aqui sua justificativa, ela será analisada..."
                      value={absenceReason}
                      onChange={(e) => setAbsenceReason(e.target.value)}
                      className="w-full bg-slate-950/50 border border-rose-500/30 rounded-xl p-4 text-sm text-rose-100 placeholder:text-rose-900/50 resize-none h-32 focus:outline-none focus:border-rose-500 transition-colors"
                    />
                  </div>

                  {studentFlowError && <p className="text-rose-400 text-xs font-bold text-center mb-4 bg-rose-500/10 py-2 rounded-lg">{studentFlowError}</p>}

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button 
                      onClick={() => setJustificationStep(2)}
                      className="sm:w-1/3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black text-xs md:text-sm uppercase tracking-widest py-4 rounded-2xl transition-colors"
                    >
                      Voltar
                    </button>
                    <button 
                      onClick={handleFinishJustification}
                      className="sm:w-2/3 bg-gradient-to-r from-rose-500 to-rose-400 hover:from-rose-400 hover:to-rose-300 text-slate-950 font-black text-xs md:text-sm uppercase tracking-widest py-4 rounded-2xl transition-all shadow-[0_4px_14px_0_rgba(244,63,94,0.39)] hover:-translate-y-0.5"
                    >
                      Enviar Justificativa
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
          <motion.div key="home" {...pageTransition} className="min-h-screen bg-[#050913] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(14,165,233,0.18),rgba(2,6,23,0))] flex flex-col items-center p-4 sm:p-6 md:p-8">
            
            {/* Top Navigation Bar */}
            <header className="w-full max-w-4xl flex flex-wrap items-center justify-between gap-3 mb-6 md:mb-8 pt-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 p-0.5 shadow-[0_0_15px_rgba(14,165,233,0.4)]">
                  <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center overflow-hidden">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-cyan-300 font-black text-sm">TS</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-black text-sm tracking-wider uppercase">Projeto Tsunami</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Ao Vivo
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium">Inscrições & Sorteio de Linhas</span>
                </div>
              </div>

              {/* Header Right Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {isAdmin ? (
                  <>
                    <div className="px-3 py-1.5 bg-amber-500/15 border border-amber-500/40 text-amber-300 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                      <span>Professor</span>
                    </div>

                    <button 
                      type="button"
                      onClick={() => setSaturdaySportOpen(true)}
                      className="px-3.5 py-1.5 border border-amber-500/50 bg-gradient-to-r from-amber-500/25 to-amber-600/25 hover:from-amber-500/40 hover:to-amber-600/40 text-amber-200 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 shadow-[0_0_15px_rgba(245,158,11,0.25)] hover:scale-105 active:scale-95 cursor-pointer"
                    >
                      <span>⚽</span>
                      <span>ESPORTE NO SÁBADO</span>
                    </button>

                    <button 
                      type="button"
                      onClick={() => setView('adminPanel')}
                      className="px-3.5 py-1.5 border border-sky-500/40 bg-sky-950/60 text-sky-300 hover:bg-sky-500/20 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Painel Admin</span>
                    </button>

                    <button 
                      type="button"
                      onClick={handleAdminLogout}
                      className="px-3 py-1.5 border border-slate-700 bg-slate-900/60 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                      title="Sair do Modo Professor"
                    >
                      Sair
                    </button>
                  </>
                ) : (
                  <button 
                    type="button"
                    onClick={() => setAdminQuickLoginOpen(true)}
                    className="px-4 py-2 border border-slate-700/60 bg-slate-900/60 hover:bg-slate-800/80 text-slate-300 hover:text-sky-300 hover:border-sky-500/40 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Lock className="w-3.5 h-3.5 text-sky-400" />
                    <span>Área do Professor</span>
                  </button>
                )}
              </div>
            </header>

            {/* Main Content Column */}
            <main className="w-full max-w-xl space-y-6 pb-16">
              
              {/* Card 1: Hero Header */}
              <div className="relative overflow-hidden bg-slate-900/70 backdrop-blur-2xl border border-slate-800/80 rounded-[2.25rem] p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-600/10 rounded-full blur-2xl pointer-events-none" />

                <div className="relative z-10 flex justify-between items-start gap-4 mb-6">
                  <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-sky-500/10 border border-sky-500/25 text-sky-400 rounded-full text-[10px] font-black uppercase tracking-widest mb-3">
                      <Calendar className="w-3 h-3" />
                      Agenda: {activeDay}
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-none uppercase">
                      PRÉ-INSCRIÇÕES<br/>
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-400">
                        PROJETO TSUNAMI
                      </span>
                    </h1>
                  </div>

                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl flex items-center justify-center shrink-0 overflow-hidden bg-slate-950/80 border border-slate-700/60 shadow-[0_0_20px_rgba(14,165,233,0.2)]">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Tsunami Logo" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white font-black text-2xl tracking-tighter">TS</span>
                    )}
                  </div>
                </div>
                
                {/* Notice Alert */}
                <div className="relative z-10 bg-slate-950/60 border border-sky-500/30 rounded-2xl p-4 sm:p-5 mb-5 shadow-inner">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-sky-400 animate-ping mt-1.5 shrink-0" />
                    <p className="text-sky-200 text-xs sm:text-sm font-medium tracking-wide whitespace-pre-line leading-relaxed">
                      {notice}
                    </p>
                  </div>
                </div>
                
                <p className="relative z-10 text-slate-400 text-xs sm:text-sm leading-relaxed">
                  Garanta sua vaga para os treinos e partidas da semana clicando no botão de inscrição abaixo.
                </p>
              </div>

              {/* Card 2: CTA Button */}
              <div className="relative group">
                <div className={`absolute -inset-0.5 rounded-[2.25rem] blur opacity-40 transition-opacity duration-500 ${
                  enrollmentsLocked 
                    ? 'bg-rose-500/30' 
                    : 'bg-gradient-to-r from-emerald-500 via-teal-400 to-sky-500 group-hover:opacity-75'
                }`} />
                <div className="relative bg-slate-900/90 backdrop-blur-2xl border border-slate-700/60 rounded-[2.25rem] p-6 sm:p-8 text-center shadow-2xl">
                  {enrollmentsLocked ? (
                    <div className="py-2 flex flex-col items-center justify-center gap-2">
                      <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center">
                        <Lock className="w-6 h-6" />
                      </div>
                      <h3 className="text-rose-300 font-black text-sm sm:text-base uppercase tracking-widest mt-1">Inscrições Trancadas</h3>
                      <p className="text-slate-400 text-xs font-medium">Aguarde a liberação pela comissão de professores.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <button 
                        type="button"
                        onClick={startStudentFlow}
                        className="w-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500 hover:from-emerald-300 hover:via-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm sm:text-base uppercase tracking-widest py-5 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-[0_10px_30px_rgba(16,185,129,0.35)] hover:scale-[1.02] active:scale-[0.99] cursor-pointer"
                      >
                        <LogIn className="w-5 h-5 text-slate-950 stroke-[2.5]" />
                        <span>Fazer Inscrição Agora</span>
                        <ArrowRight className="w-5 h-5 text-slate-950 stroke-[2.5]" />
                      </button>
                      <p className="text-[11px] text-slate-400 uppercase tracking-widest font-semibold">
                        Rápido e seguro em 3 passos
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 3: Real-Time Slots & Classes */}
              <div className="bg-slate-900/70 backdrop-blur-2xl border border-slate-800/80 rounded-[2.25rem] p-6 sm:p-8 shadow-2xl">
                <div className="flex items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-800/60">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                    <h2 className="text-xs sm:text-sm font-black text-white uppercase tracking-widest">
                      Vagas em Tempo Real
                    </h2>
                  </div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-800/60 px-2.5 py-1 rounded-full border border-slate-700/50">
                    {classes.filter(c => c.isOpen).length} Turmas Abertas
                  </span>
                </div>

                {isAdmin && (
                  <div className="bg-amber-950/30 border border-amber-500/40 rounded-2xl p-4 mb-6 flex items-center justify-between gap-3 shadow-[0_0_20px_rgba(245,158,11,0.1)]">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">⭐</span>
                      <div>
                        <span className="text-xs font-black uppercase tracking-wider text-amber-300 block">
                          Modo Professor: Ajuste Rápido de Nível
                        </span>
                        <span className="text-[11px] text-slate-300">
                          Clique nas estrelas de qualquer participante para alterar o nível técnico instantaneamente.
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-amber-300 font-black uppercase shrink-0 bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/30">
                      1 Toque
                    </span>
                  </div>
                )}
                
                {classes.filter(c => c.isOpen).length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center bg-slate-950/50 rounded-2xl border border-slate-800/60 p-6">
                    <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 text-slate-500 flex items-center justify-center mb-3">
                      <Lock className="w-6 h-6" />
                    </div>
                    <p className="text-slate-400 font-black tracking-widest uppercase text-xs sm:text-sm">
                      Inscrições Fechadas no Momento<br/>
                      <span className="text-slate-500 text-xs font-normal normal-case">Aguarde a liberação pela organização.</span>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {classes.filter(c => c.isOpen).map(cls => (
                      <div key={cls.id} className="bg-slate-950/50 border border-slate-800/80 rounded-2xl p-4 sm:p-5 relative group">
                        
                        {/* Class Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-tight">
                                {cls.name}
                              </h3>
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20">
                                {cls.multiplier * 5} vagas
                              </span>
                            </div>
                            <span className="text-slate-400 text-xs font-medium tracking-wide">
                              {cls.description}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => setActiveDrawClassId(cls.id)}
                            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shrink-0 w-fit cursor-pointer ${
                              savedDraws[cls.id]
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                                : 'bg-slate-850 hover:bg-slate-800 text-sky-300 border border-slate-700/70 hover:border-sky-500/50'
                            }`}
                          >
                            <Shuffle className="w-3.5 h-3.5 text-sky-400" />
                            {savedDraws[cls.id] ? 'Ver Times Sorteados 📋' : 'Sortear Linhas ⚖️'}
                          </button>
                        </div>

                        {/* Saved Draw Card Alert */}
                        {savedDraws[cls.id] && (
                          <div 
                            onClick={() => setActiveDrawClassId(cls.id)}
                            className="cursor-pointer bg-gradient-to-r from-emerald-950/50 via-slate-900 to-sky-950/50 border border-emerald-500/30 hover:border-emerald-400 rounded-xl p-3.5 mb-4 flex items-center justify-between gap-3 transition-all group/card shadow-sm"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-black text-sm">
                                ⚽
                              </div>
                              <div>
                                <span className="text-xs font-black uppercase text-emerald-300 tracking-wide block">
                                  Linhas Sorteadas & Equilibradas!
                                </span>
                                <span className="text-[11px] text-slate-400">
                                  {savedDraws[cls.id].teams.length} times de {savedDraws[cls.id].teamSize} jogadores
                                  {savedDraws[cls.id].waitlist.length > 0 && ` • ${savedDraws[cls.id].waitlist.length} na espera`}
                                </span>
                              </div>
                            </div>
                            <span className="text-xs font-bold text-sky-400 group-hover/card:underline flex items-center gap-1 shrink-0">
                              Ver Escalação <ArrowRight className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        )}
                        
                        {/* Participants list */}
                        <div className="space-y-2">
                          {(() => {
                            const participants = getClassParticipants(cls.id);
                            const maxVagas = cls.multiplier * 5;
                            const isFull = participants.length >= maxVagas;
                            const occupancyPercent = maxVagas > 0 ? Math.min(100, Math.round((participants.length / maxVagas) * 100)) : 0;
                            
                            return (
                              <>
                                {/* Progress Bar */}
                                <div className="mb-3">
                                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider mb-1.5">
                                    <span className={isFull ? 'text-rose-400' : 'text-emerald-400'}>
                                      {isFull ? 'Lotado' : `${maxVagas - participants.length} vagas restantes`}
                                    </span>
                                    <span className="text-slate-400">
                                      {participants.length} / {maxVagas} ({occupancyPercent}%)
                                    </span>
                                  </div>
                                  <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                                    <div 
                                      className={`h-full rounded-full transition-all duration-500 ${
                                        isFull 
                                          ? 'bg-rose-500' 
                                          : occupancyPercent > 70 
                                            ? 'bg-amber-400' 
                                            : 'bg-gradient-to-r from-emerald-500 to-sky-400'
                                      }`}
                                      style={{ width: `${occupancyPercent}%` }}
                                    />
                                  </div>
                                </div>

                                {participants.length === 0 ? (
                                  <div className="bg-slate-900/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between border border-dashed border-slate-800 gap-2">
                                    <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                                      Nenhum aluno inscrito ainda
                                    </span>
                                    <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 bg-emerald-500/10 rounded-lg w-fit border border-emerald-500/20">
                                      {maxVagas} vagas livres
                                    </span>
                                  </div>
                                ) : (
                                  <div className="space-y-1.5">
                                    {participants.map((p, idx) => {
                                      const isWaitlist = idx >= maxVagas;
                                      return (
                                        <div 
                                          key={p.key} 
                                          className={`rounded-xl p-3 flex items-center justify-between border transition-all ${
                                            isWaitlist 
                                              ? 'bg-rose-950/20 border-rose-900/40' 
                                              : p.isGuest 
                                                ? 'bg-amber-950/25 border-amber-500/40 shadow-sm shadow-amber-500/5' 
                                                : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                                          }`}
                                        >
                                          <div className="flex items-center gap-3 w-full">
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                                              isWaitlist 
                                                ? 'bg-rose-900/40 text-rose-300' 
                                                : p.isGuest 
                                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                                                  : 'bg-slate-800 text-slate-300'
                                            }`}>
                                              {idx + 1}
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2 flex-1 min-w-0">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className={`text-xs sm:text-sm font-black uppercase truncate ${
                                                  isWaitlist 
                                                    ? 'text-rose-200/80' 
                                                    : p.isGuest 
                                                      ? 'text-amber-300' 
                                                      : 'text-slate-100'
                                                }`}>
                                                  {p.name}
                                                </span>
                                                {p.isGuest && (
                                                  <span className="text-[10px] font-black text-amber-400 uppercase tracking-wide shrink-0">
                                                    {p.guestOf && p.guestOf !== 'Admin' ? `(CONVIDADO DE ${p.guestOf})` : '(CONVIDADO)'}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                            
                                            {/* Stars Badge - with 1-click admin adjustment */}
                                            <div className="flex items-center gap-2 shrink-0 ml-auto">
                                              {isAdmin ? (
                                                <div className="flex items-center gap-1 bg-slate-950 border border-amber-500/40 hover:border-amber-400 px-2 py-1 rounded-xl shadow-sm transition-all">
                                                  <span className="text-[9px] font-black text-amber-400 uppercase hidden sm:inline tracking-tighter">
                                                    Nível:
                                                  </span>
                                                  <div className="flex items-center gap-0.5">
                                                    {([1, 2, 3, 4, 5] as const).map(starNum => {
                                                      const isSelected = starNum <= p.level;
                                                      return (
                                                        <button
                                                          key={starNum}
                                                          type="button"
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleAdminUpdateParticipantLevel(cls.id, p, starNum);
                                                          }}
                                                          title={`Definir como ${starNum} estrela${starNum > 1 ? 's' : ''} (${SKILL_LEVEL_OPTIONS[starNum - 1]?.label})`}
                                                          className={`text-sm sm:text-base leading-none transition-all hover:scale-135 active:scale-90 p-0.5 rounded cursor-pointer ${
                                                            isSelected 
                                                              ? 'opacity-100 drop-shadow-[0_0_6px_rgba(250,204,21,0.7)]' 
                                                              : 'opacity-25 hover:opacity-80 grayscale hover:grayscale-0'
                                                          }`}
                                                        >
                                                          ⭐
                                                        </button>
                                                      );
                                                    })}
                                                  </div>
                                                  <span className="text-[10px] font-mono text-amber-300 font-bold ml-1">
                                                    {p.level}★
                                                  </span>
                                                  {updatedFlashKey === p.key && (
                                                    <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/20 border border-emerald-500/40 px-1 py-0.5 rounded animate-pulse ml-1">
                                                      ✓
                                                    </span>
                                                  )}
                                                </div>
                                              ) : (
                                                <button 
                                                  type="button"
                                                  onClick={() => setAdminQuickLoginOpen(true)}
                                                  className={`text-[11px] tracking-tight px-2 py-0.5 rounded-lg border font-mono select-none transition-transform hover:scale-105 cursor-pointer ${
                                                    p.isGuest
                                                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                                      : 'bg-slate-900 border-slate-700/60 text-sky-300'
                                                  }`}
                                                  title={`Nível: ${SKILL_LEVEL_OPTIONS.find(o => o.level === p.level)?.label || 'Regular'} (Clique para gerenciar como Professor)`}
                                                >
                                                  {getSkillStars(p.level)}
                                                </button>
                                              )}
                                              {isWaitlist && (
                                                <span className="text-[9px] font-black tracking-widest uppercase text-rose-300 bg-rose-500/20 border border-rose-500/40 px-2 py-1 rounded-md shrink-0">
                                                  Espera
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
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
                        <div className="pt-6 border-t border-slate-800 mt-6">
                          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                            Ausências Justificadas
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            {justifiedIds.map(studentId => {
                              const st = students.find(s => s.id === studentId);
                              return (
                                <span key={studentId} className="bg-slate-950 border border-slate-800 text-slate-400 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg">
                                  {st?.name || 'Aluno'}
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

              {/* Justification CTA at the bottom */}
              {absenceJustificationOpen && (
                <div className="relative group">
                  <div className="absolute inset-0 rounded-[2rem] blur opacity-25 transition-opacity duration-500 bg-rose-500 group-hover:opacity-40"></div>
                  <div className="relative bg-slate-900/90 backdrop-blur-xl border border-rose-500/30 rounded-[2rem] p-6 text-center shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-left">
                      <h3 className="text-rose-300 font-black text-sm sm:text-base uppercase tracking-widest mb-1">
                        Não vai poder comparecer?
                      </h3>
                      <p className="text-slate-400 text-xs font-medium">
                        Avise os professores enviando sua justificativa de ausência.
                      </p>
                    </div>
                    <button 
                      type="button"
                      onClick={startJustificationFlow}
                      className="w-full sm:w-auto bg-slate-850 hover:bg-slate-800 border border-rose-500/40 hover:border-rose-500 text-rose-300 hover:text-white font-black text-xs uppercase tracking-widest py-3 px-6 rounded-xl transition-all cursor-pointer shadow-sm"
                    >
                      Justificar Ausência
                    </button>
                  </div>
                </div>
              )}

            </main>
          </motion.div>
        )}
      </AnimatePresence>

      {activeDrawClassId && (
        <TeamDrawModal
          isOpen={!!activeDrawClassId}
          onClose={() => setActiveDrawClassId(null)}
          classId={activeDrawClassId}
          className={classes.find(c => c.id === activeDrawClassId)?.name || 'Turma'}
          participants={getClassParticipants(activeDrawClassId)}
          savedDraw={savedDraws[activeDrawClassId]}
          onSaveDraw={handleSaveDraw}
        />
      )}

      {saturdaySportOpen && (
        <SaturdaySportModal
          isOpen={saturdaySportOpen}
          onClose={() => setSaturdaySportOpen(false)}
          classes={classes}
          students={students}
          participantsByClass={getClassParticipants}
          activeDay={activeDay}
          onSetActiveDay={handleSetActiveDay}
          onAddStudentToClass={handleSaturdayAddStudentToClass}
          onAddMultipleStudentsToClass={handleSaturdayAddMultipleStudentsToClass}
          onRemoveParticipantFromClass={handleSaturdayRemoveParticipantFromClass}
          onAddGuestToClass={handleSaturdayAddGuestToClass}
          onUpdateParticipantLevel={handleAdminUpdateParticipantLevel}
          onOpenDrawModal={(classId) => setActiveDrawClassId(classId)}
          savedDraws={savedDraws}
        />
      )}

      {adminQuickLoginOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-tight">
                    Modo Professor
                  </h3>
                  <span className="text-[10px] text-amber-400/80 uppercase font-black tracking-wider">Acesso Rápido</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAdminQuickLoginOpen(false);
                  setQuickAdminPassword('');
                  setQuickAdminError('');
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Autentique-se como professor para ajustar o nível de estrelas dos inscritos diretamente na página inicial com 1 clique.
            </p>

            <form onSubmit={handleQuickAdminLogin} className="space-y-3">
              <div className="space-y-1">
                <input
                  type="password"
                  value={quickAdminPassword}
                  onChange={(e) => setQuickAdminPassword(e.target.value)}
                  placeholder="Digite a senha de admin"
                  autoFocus
                  className="w-full bg-slate-950 border border-slate-700/80 focus:border-amber-400 rounded-xl px-4 py-3 text-white text-center tracking-widest text-sm focus:outline-none transition-all placeholder:tracking-normal placeholder:text-slate-600"
                />
              </div>

              {quickAdminError && (
                <p className="text-rose-400 text-xs font-bold text-center bg-rose-500/10 py-1.5 rounded-lg border border-rose-500/20">{quickAdminError}</p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setAdminQuickLoginOpen(false);
                    setQuickAdminPassword('');
                    setQuickAdminError('');
                  }}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-700 text-slate-400 font-bold text-xs uppercase hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase shadow-md shadow-amber-500/20 transition-all cursor-pointer"
                >
                  Ativar Modo
                </button>
              </div>

              <div className="pt-2 border-t border-slate-800/80 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setAdminQuickLoginOpen(false);
                    setView('adminLogin');
                  }}
                  className="text-[11px] text-sky-400 hover:text-sky-300 hover:underline uppercase tracking-wide font-bold"
                >
                  Ir para a tela de Login do Painel Completo →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
