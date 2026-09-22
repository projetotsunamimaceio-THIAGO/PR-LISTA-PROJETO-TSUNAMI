import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from "react";
import { LogIn, Lock, ArrowLeft, Plus, Trash2, LogOut, RefreshCw, Search, X, Check, ShieldAlert, Save, Users, Shuffle, Scale, ArrowRight } from "lucide-react";
import { doc, setDoc, getDocs, deleteDoc, onSnapshot, collection, serverTimestamp, addDoc, query, orderBy, limit } from "firebase/firestore";
import { db } from "./lib/firebase";
import { motion, AnimatePresence } from "framer-motion";
import { TeamDrawModal } from "./components/TeamDrawModal";
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
      const studentName = st?.name || 'Aluno Desconhecido';
      
      if (enr.classes.includes(classId)) {
        const studentLevel = enr.classLevels?.[classId] || enr.skillLevel || st?.classLevels?.[classId] || st?.skillLevel || 3;
        participants.push({
          key: `${enr.studentId}-main`,
          name: studentName,
          isGuest: false,
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
                    onClick={() => {
                      const firstCls = classes.find(c => c.isOpen) || classes[0];
                      if (firstCls) setActiveDrawClassId(firstCls.id);
                    }}
                    className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs md:text-sm uppercase tracking-widest py-3 px-6 rounded-2xl flex items-center gap-2 transition-all shadow-[0_4px_14px_0_rgba(14,165,233,0.39)] hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <Shuffle className="w-4 h-4" /> Sorteador de Linhas
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
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button 
                    onClick={() => setView('home')} 
                    className="bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 hover:border-amber-500/50 font-black text-xs uppercase tracking-wider px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm"
                    title="Ver Página Inicial com o Modo Professor Ativo para alterar níveis dos alunos"
                  >
                    <span>Página Inicial (Modo Professor)</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleAdminLogout} 
                      className="w-10 h-10 bg-slate-800/50 rounded-xl flex items-center justify-center hover:bg-rose-950/50 hover:text-rose-400 text-slate-400 transition-colors border border-slate-700/50 hover:border-rose-900/50"
                      title="Sair do Modo Administrador"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                    <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">Sair</span>
                  </div>
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
                        <div className="flex items-center gap-2">
                          <span className="text-sky-400 text-sm font-black tracking-widest">
                            TOTAL: {cls.multiplier * 5} VAGAS
                          </span>
                          {(() => {
                            let count = 0;
                            enrollments.filter(e => e.classes.includes(cls.id) && !e.justifiedAbsence).forEach(e => {
                              count += 1;
                              const gList = (e.guests?.[cls.id] || []).filter(g => g.trim().length > 0).slice(0, 2);
                              count += gList.length;
                            });
                            return (
                              <span className="text-[11px] font-bold text-slate-300 bg-slate-800/80 px-2.5 py-0.5 rounded-lg border border-slate-700/50">
                                {count} inscritos
                              </span>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-3">
                          <button 
                            type="button"
                            onClick={() => setActiveDrawClassId(cls.id)}
                            className="bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 hover:border-sky-500/50 font-black text-xs uppercase tracking-wider px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-all"
                          >
                            <Shuffle className="w-3.5 h-3.5 text-sky-400" />
                            {savedDraws[cls.id] ? `Linhas (${savedDraws[cls.id].teams.length} times)` : 'Sortear'}
                          </button>
                          <button 
                            onClick={() => removeClass(cls.id)}
                            className="text-rose-500/70 hover:text-rose-400 text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" /> Excluir
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
                <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-3xl p-6 shadow-lg shadow-black/10">
                  <div className="mb-6 flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                          Dia da Semana (Agenda Ativa)
                        </h3>
                        {daySavedSuccess && (
                          <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="w-3 h-3" /> Salvo no sistema!
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
                            className={`py-2 px-1 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all text-center border ${
                              activeDay === day 
                                ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-[0_0_12px_rgba(14,165,233,0.35)] scale-[1.02]' 
                                : 'bg-slate-800/60 text-slate-300 border-slate-700/60 hover:bg-slate-700 hover:text-white'
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
                          className="flex-1 bg-slate-950/60 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-white uppercase placeholder:normal-case placeholder:text-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => handleSetActiveDay(activeDay)}
                          disabled={isSavingDay}
                          className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider transition-colors shrink-0 flex items-center gap-1.5 shadow-sm"
                        >
                          <Save className="w-3.5 h-3.5" /> Salvar
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2">
                        Dia exibido na página inicial: <strong className="text-sky-300 uppercase">{activeDay}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                      Logo do Projeto
                    </h3>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-slate-950/50 border border-slate-700/50 flex items-center justify-center overflow-hidden shrink-0">
                        {logoUrl ? (
                          <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-slate-600 text-[10px] font-bold uppercase">SEM LOGO</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-widest py-2 px-4 rounded-xl transition-colors inline-block text-center border border-slate-700/50 w-full">
                          Alterar Logo
                          <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                        </label>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-2 text-center md:text-left">
                          Formatos: JPG, PNG
                        </p>
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
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                        Quadro de Avisos
                      </h3>
                      {noticeSavedSuccess && (
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1">
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
                      className="w-full bg-slate-950/50 border border-slate-700/50 rounded-2xl p-4 text-sm text-sky-100 resize-none h-28 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all leading-relaxed"
                    />
                    <button
                      id="save-notice-btn"
                      type="button"
                      onClick={() => handleSaveNotice(notice)}
                      disabled={isSavingNotice}
                      className={`mt-2 w-full font-bold text-xs uppercase tracking-widest py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all ${
                        noticeSavedSuccess
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-sky-600 hover:bg-sky-500 text-white shadow-[0_4px_14px_0_rgba(2,132,199,0.39)] active:scale-[0.99]'
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
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1.5 text-center">
                      Salva automaticamente ao sair do campo ou clicando no botão
                    </p>
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
                        <div key={student.id} className={`border rounded-2xl p-4 flex flex-col gap-3 transition-colors ${student.isAllowed ? 'bg-slate-800/40 border-slate-700/50' : 'bg-rose-950/10 border-rose-900/30'}`}>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <h4 className={`font-bold text-sm tracking-tight uppercase line-clamp-1 ${student.isAllowed ? 'text-white' : 'text-rose-200/50'}`} title={student.name}>
                                  {student.name}
                                </h4>
                                
                                {/* 1-Click Star Selector for Professor */}
                                <div className="flex items-center gap-1 bg-slate-950/90 border border-amber-500/30 px-2 py-0.5 rounded-lg w-fit">
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
                          
                          {student.isAllowed && (
                            <div className="pt-3 border-t border-slate-700/50 flex flex-col gap-2">
                              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Turmas Permitidas:</p>
                              <div className="flex flex-wrap gap-2">
                                {classes.map(c => {
                                   const isChecked = student.allowedClasses ? student.allowedClasses.includes(c.id) : true;
                                   return (
                                     <button 
                                       key={c.id} 
                                       onClick={() => toggleStudentAllowedClass(student.id, c.id)}
                                       className={`px-3 py-1.5 border rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-2 ${isChecked ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-950 text-slate-500 border-slate-800'}`}
                                     >
                                       <div className={`w-3 h-3 rounded-sm flex items-center justify-center border ${isChecked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'}`}>
                                         {isChecked && <Check className="w-2 h-2 text-slate-900" />}
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
                <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-3xl p-6 flex flex-col h-[600px] shadow-lg shadow-black/10">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-1.5 h-5 bg-amber-500 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>
                    <h3 className="text-lg font-black text-white tracking-tight">Comportamento</h3>
                  </div>

                  <div className="relative mb-6 shrink-0">
                    <Search className="w-4 h-4 absolute left-4 top-3.5 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Pesquisar aluno..." 
                      value={behaviorSearchInput}
                      onChange={(e) => setBehaviorSearchInput(e.target.value)}
                      className="w-full bg-slate-950/50 border border-slate-700/50 rounded-2xl pl-11 pr-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-3 space-y-3">
                    {students.filter(s => s.isAllowed && s.name.toLowerCase().includes(behaviorSearchInput.toLowerCase())).map(student => (
                      <div key={student.id} className="border border-slate-700/50 rounded-2xl p-4 bg-slate-800/40 flex flex-col gap-3">
                        <div className="flex justify-between items-center cursor-pointer" onClick={() => setSelectedBehaviorStudentId(selectedBehaviorStudentId === student.id ? null : student.id)}>
                          <h4 className="font-bold text-sm tracking-tight uppercase text-white line-clamp-1">{student.name}</h4>
                          <div className={`px-3 py-1 rounded-lg text-xs font-black ${(student.behaviorScore ?? 10) >= 7 ? 'bg-emerald-500/20 text-emerald-400' : (student.behaviorScore ?? 10) >= 4 ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'}`}>
                            Nota: {student.behaviorScore ?? 10}
                          </div>
                        </div>

                        {selectedBehaviorStudentId === student.id && (
                          <div className="pt-3 border-t border-slate-700/50 mt-1 flex flex-col gap-2">
                            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Aplicar Punição:</p>
                            <div className="flex flex-wrap gap-2">
                              <button onClick={() => handleApplyBehaviorPenalty(student.id, 1, 'Conversando')} className="px-3 py-1.5 bg-slate-950 hover:bg-rose-950/40 text-slate-300 hover:text-rose-400 border border-slate-700 hover:border-rose-900/50 rounded-lg text-[10px] font-black uppercase transition-all">-1 Conversando</button>
                              <button onClick={() => handleApplyBehaviorPenalty(student.id, 2, 'Conversando Muito')} className="px-3 py-1.5 bg-slate-950 hover:bg-rose-950/40 text-slate-300 hover:text-rose-400 border border-slate-700 hover:border-rose-900/50 rounded-lg text-[10px] font-black uppercase transition-all">-2 Conversando Muito</button>
                              <button onClick={() => handleApplyBehaviorPenalty(student.id, 1, 'Brincadeira')} className="px-3 py-1.5 bg-slate-950 hover:bg-rose-950/40 text-slate-300 hover:text-rose-400 border border-slate-700 hover:border-rose-900/50 rounded-lg text-[10px] font-black uppercase transition-all">-1 Brincadeira</button>
                              <button onClick={() => handleApplyBehaviorPenalty(student.id, 2, 'Celular')} className="px-3 py-1.5 bg-slate-950 hover:bg-rose-950/40 text-slate-300 hover:text-rose-400 border border-slate-700 hover:border-rose-900/50 rounded-lg text-[10px] font-black uppercase transition-all">-2 Celular</button>
                              <button onClick={() => handleApplyBehaviorPenalty(student.id, 1, 'Sem Atenção')} className="px-3 py-1.5 bg-slate-950 hover:bg-rose-950/40 text-slate-300 hover:text-rose-400 border border-slate-700 hover:border-rose-900/50 rounded-lg text-[10px] font-black uppercase transition-all">-1 Sem Atenção</button>
                            </div>
                            
                            {student.infractions && student.infractions.length > 0 && (
                               <div className="mt-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                                 <p className="text-[9px] uppercase font-bold text-rose-400 tracking-widest mb-1.5">Histórico de Punições:</p>
                                 <p className="text-[10px] text-rose-200/80 mb-3">{student.infractions.join(', ')}</p>
                                 <button onClick={() => handleResetBehavior(student.id)} className="w-full px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all">
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
              <div className="lg:col-span-12 bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 md:p-8 shadow-xl shadow-black/20 mt-4">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-1.5 h-6 bg-purple-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
                  <h2 className="text-lg md:text-xl font-bold text-white tracking-tight uppercase">Histórico de Atividades</h2>
                </div>
                
                {activityLogs.length === 0 ? (
                  <div className="text-center py-8 bg-slate-950/50 rounded-2xl border border-slate-800">
                    <p className="text-slate-500 text-sm uppercase tracking-widest font-bold">Nenhuma atividade recente.</p>
                  </div>
                ) : (
                  <div className="bg-slate-950/50 rounded-2xl border border-slate-800/80 p-4 md:p-6 space-y-3">
                    {activityLogs.map(log => {
                      const date = new Date(log.timestamp);
                      const dateString = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                      const timeString = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                      
                      let actionText = '';
                      if (log.action === 'enrolled') {
                        actionText = `se inscreveu no ${log.details.replace('Inscreveu-se em: ', '')}`;
                      } else if (log.action === 'unenrolled') {
                        actionText = 'retirou o nome de todas as turmas';
                      } else if (log.action === 'changed') {
                        if (log.details.includes('Alterou')) {
                          actionText = `alterou a inscrição para ${log.details.replace('Alterou inscrição para: ', '')}`;
                        } else {
                          actionText = 'salvou a inscrição';
                        }
                      } else if (log.action === 'justified') {
                        actionText = `justificou ausência: "${log.details.replace('Justificou ausência: ', '')}"`;
                      }

                      return (
                        <div key={log.id} className="text-sm md:text-base font-medium text-slate-300 border-b border-slate-800/50 pb-3 last:border-0 last:pb-0">
                          <span className="font-bold text-sky-400">{log.studentName}</span> - {actionText} , as {timeString} de {dateString};
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
                <div className="text-center mb-6">
                  <span className="inline-block px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black tracking-widest uppercase mb-3">Passo Final</span>
                  <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-2 text-white">Inscrição & Convidados</h1>
                  <div className="inline-block px-4 py-1.5 bg-slate-800/60 border border-slate-700/70 rounded-xl">
                    <p className="text-sky-300 text-xs uppercase font-black tracking-widest">
                      {students.find(s => s.id === selectedStudentId)?.name}
                    </p>
                  </div>
                </div>
                
                <div className="w-full bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-[2rem] p-6 md:p-8 shadow-2xl flex flex-col">
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
                        <div className="text-center py-10 bg-slate-950/50 rounded-2xl border border-slate-800">
                          <p className="text-slate-500 text-sm uppercase tracking-widest font-bold">Nenhuma turma disponível no momento.</p>
                        </div>
                      );
                    }

                    return (
                      <>
                        {/* AVISO: NÍVEL DEFINIDO EXCLUSIVAMENTE PELO PROFESSOR */}
                        <div className="bg-slate-950/80 border border-sky-500/30 rounded-2xl p-4 mb-5 shadow-lg flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center text-xl shrink-0">
                            ⭐
                          </div>
                          <div className="flex-1">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                              <span className="text-xs font-black uppercase tracking-wider text-sky-300">
                                Nível de Jogo & Estrelas (Definido pelo Professor)
                              </span>
                              <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md w-fit">
                                Apenas o Professor
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              Para manter os sorteios de times justos e perfeitamente equilibrados, o nível de estrelas dos atletas e convidados é avaliado e definido <strong className="text-white">exclusivamente pelo Professor</strong> do projeto.
                            </p>
                            {/* Mostra o nível atual já atribuído pelo professor */}
                            {(() => {
                              const existingLevel = student?.skillLevel || enrollments.find(e => e.studentId === selectedStudentId)?.skillLevel;
                              if (existingLevel) {
                                return (
                                  <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center gap-2">
                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                      Seu nível avaliado pelo professor:
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
                        <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-950/80 rounded-2xl border border-slate-800 mb-6">
                          <button
                            type="button"
                            onClick={() => setEnrollmentSubTab('classes')}
                            className={`py-3 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                              enrollmentSubTab === 'classes'
                                ? 'bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                                : 'text-slate-400 hover:text-white hover:bg-slate-900/50'
                            }`}
                          >
                            <span>Turmas</span>
                            {selectedClasses.length > 0 && (
                              <span className="bg-slate-950 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-bold">
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
                            className={`py-3 px-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                              enrollmentSubTab === 'guests'
                                ? 'bg-amber-500 text-slate-950 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
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
                              Selecione as turmas em que você vai participar e ajuste seu nível se desejar:
                            </p>
                            {availableClasses.map(c => {
                              const isSelected = selectedClasses.includes(c.id);
                              const classGuests = (selectedGuests[c.id] || []).filter(g => g.trim().length > 0).slice(0, 2);
                              const currentLvl = selectedStudentLevels[c.id] || selectedStudentLevel || 3;
                              const currentOpt = SKILL_LEVEL_OPTIONS.find(o => o.level === currentLvl);

                              return (
                                <div 
                                  key={c.id} 
                                  className={`rounded-2xl transition-all border p-4 md:p-5 ${
                                    isSelected 
                                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.15)]' 
                                      : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-500 text-slate-300'
                                  }`}
                                >
                                  <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleStudentClass(c.id)}>
                                    <div>
                                      <span className="text-sm md:text-base font-black uppercase tracking-tight">
                                        {c.name}
                                      </span>
                                      <p className={`text-xs mt-1 ${isSelected ? 'text-emerald-500/70' : 'text-slate-500'}`}>
                                        {c.description}
                                      </p>
                                    </div>
                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                                      isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-500'
                                    }`}>
                                      {isSelected && <Check className="w-3.5 h-3.5 text-slate-950" />}
                                    </div>
                                  </div>

                                  {/* Exibição de nível definido pelo professor */}
                                  {isSelected && (
                                    <div className="mt-3 pt-3 border-t border-emerald-500/20 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                                        Nível nesta turma (definido pelo professor):
                                      </span>
                                      <span className="text-xs text-amber-300 font-mono font-bold bg-slate-950 px-2.5 py-0.5 rounded-lg border border-emerald-500/30">
                                        {getSkillStars(student?.classLevels?.[c.id] || student?.skillLevel || 3)}
                                      </span>
                                    </div>
                                  )}

                                  <div className="mt-3 pt-3 border-t border-slate-700/40 flex items-center justify-between">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setGuestClassId(c.id);
                                        setEnrollmentSubTab('guests');
                                      }}
                                      className="text-[11px] font-bold text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1.5 uppercase tracking-wide"
                                    >
                                      <Users className="w-3.5 h-3.5" />
                                      {classGuests.length > 0 ? `+ Gerenciar convidados (${classGuests.length})` : '+ Inserir Convidado nesta turma'}
                                    </button>
                                    {isSelected && (
                                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
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
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">
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
                                      className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border ${
                                        isCurrent
                                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                                          : 'bg-slate-800/60 text-slate-300 border-slate-700 hover:border-slate-500'
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
                              <div className="bg-slate-950/70 border border-amber-500/40 rounded-2xl p-4 md:p-5 shadow-lg space-y-4">
                                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                                  <div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 block">
                                      Turma onde vai aparecer:
                                    </span>
                                    <h4 className="text-base md:text-lg font-black text-white uppercase tracking-tight">
                                      {activeGuestClass.name}
                                    </h4>
                                  </div>
                                  <span className="text-[10px] font-black text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg uppercase tracking-wider shrink-0">
                                    Máx. 2 convidados
                                  </span>
                                </div>

                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                  Insira os convidados para <strong className="text-white">{activeGuestClass.name}</strong>. Na lista oficial, eles aparecerão com outra cor identificados como <strong className="text-amber-300 font-bold">(CONVIDADO DE {studentName})</strong> e apenas as estrelas do nível.
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
                                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white uppercase placeholder:normal-case placeholder:text-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
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
                                      <div className="text-[10px] text-amber-300/90 font-medium bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                                        <span>
                                          Aparecerá na lista: <strong className="text-amber-200 uppercase">{selectedGuests[activeGuestClass.id][0].trim()} (CONVIDADO DE {studentName})</strong>
                                        </span>
                                        <span className="text-[9px] font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30 uppercase shrink-0 w-fit">
                                          Nível avaliado pelo professor
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Convidado 2 */}
                                  <div className="space-y-2 pt-3 border-t border-slate-900">
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
                                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs text-white uppercase placeholder:normal-case placeholder:text-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
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
                                      <div className="text-[10px] text-amber-300/90 font-medium bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                                        <span>
                                          Aparecerá na lista: <strong className="text-amber-200 uppercase">{selectedGuests[activeGuestClass.id][1].trim()} (CONVIDADO DE {studentName})</strong>
                                        </span>
                                        <span className="text-[9px] font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30 uppercase shrink-0 w-fit">
                                          Nível avaliado pelo professor
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
                        <div className="bg-slate-950/40 rounded-xl p-3 mb-4 border border-slate-800 text-[11px] text-slate-400 flex flex-col gap-2">
                          <div className="flex justify-between items-center">
                            <span>Suas turmas selecionadas:</span>
                            <strong className="text-emerald-400 uppercase">
                              {selectedClasses.length > 0 
                                ? selectedClasses.map(cid => classes.find(c => c.id === cid)?.name).filter(Boolean).join(", ")
                                : "Nenhuma"}
                            </strong>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Convidados adicionados:</span>
                            <strong className="text-amber-400">
                              {totalGuestsCount > 0 ? `${totalGuestsCount} convidado(s)` : "Nenhum"}
                            </strong>
                          </div>
                          <div className="flex justify-between items-center pt-1 border-t border-slate-800/60 text-[10px] text-slate-500">
                            <span>Nível & Estrelas:</span>
                            <strong className="text-amber-300 font-medium">
                              Definido Exclusivamente pelo Professor
                            </strong>
                          </div>
                        </div>
                      </>
                    );
                  })()}

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
            JUSTIFICATION FLOW VIEW
        ========================================================================= */}
        {view === 'justificationFlow' && (
          <motion.div key="justificationFlow" {...pageTransition} className="min-h-screen flex items-center justify-center p-4 md:p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-950/40 via-slate-950 to-slate-950">
            {justificationStep === 1 && (
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-lg flex flex-col items-center">
                <div className="text-center mb-8">
                  <span className="inline-block px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-black tracking-widest uppercase mb-4">Passo 01 de 03</span>
                  <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-2 text-white">Justificar</h1>
                  <p className="text-slate-400 text-sm">Selecione o seu nome na lista.</p>
                </div>
                
                <div className="w-full bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-[2rem] p-6 md:p-8 shadow-2xl flex flex-col">
                  <div className="relative mb-6">
                    <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input 
                      type="text"
                      placeholder="BUSCAR NOME..."
                      value={studentSearchInput}
                      onChange={(e) => setStudentSearchInput(e.target.value)}
                      className="w-full bg-slate-950/50 border border-slate-700/50 rounded-2xl pl-12 pr-4 py-4 text-sm font-bold tracking-widest uppercase text-white focus:outline-none focus:border-rose-500 transition-colors"
                    />
                  </div>

                  <div className="flex-1 max-h-[350px] overflow-y-auto custom-scrollbar pr-2 space-y-2">
                    {students.filter(s => s.isAllowed && s.name.toLowerCase().includes(studentSearchInput.toLowerCase())).map(s => (
                      <button 
                        key={s.id}
                        onClick={() => handleSelectStudent(s.id, 'justification')}
                        className="w-full text-left bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/50 hover:border-rose-500/50 rounded-xl p-4 transition-all"
                      >
                        <span className="text-sm font-black uppercase tracking-tight text-slate-200">{s.name}</span>
                      </button>
                    ))}
                    {students.filter(s => s.isAllowed && s.name.toLowerCase().includes(studentSearchInput.toLowerCase())).length === 0 && (
                       <p className="text-center text-slate-500 text-sm py-8">Nenhum nome encontrado.</p>
                    )}
                  </div>
                  {studentFlowError && <p className="text-rose-400 text-xs font-bold text-center mt-4 bg-rose-500/10 py-2 rounded-lg">{studentFlowError}</p>}
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
          <motion.div key="home" {...pageTransition} className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-950/30 via-slate-950 to-slate-950 flex flex-col items-center p-4 md:p-8">
            <div className="w-full max-w-md md:max-w-xl absolute top-4 md:left-8 md:top-8 z-10 flex flex-wrap items-center gap-2 justify-center md:justify-start">
              {isAdmin ? (
                <>
                  <div className="px-3.5 py-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-sm shadow-amber-500/10">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                    <span>Modo Professor (Admin)</span>
                  </div>
                  <button 
                    onClick={() => setView('adminPanel')}
                    className="px-3.5 py-1.5 border border-sky-500/40 bg-sky-950/60 text-sky-300 hover:bg-sky-500/20 rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5"
                  >
                    <span>Painel Admin</span>
                  </button>
                  <button 
                    onClick={handleAdminLogout}
                    className="px-3 py-1.5 border border-slate-700 bg-slate-900/60 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 rounded-full text-[10px] font-black uppercase tracking-widest transition-all"
                    title="Sair do Modo Professor"
                  >
                    Sair
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => setAdminQuickLoginOpen(true)}
                  className="px-5 py-2.5 border border-slate-700/50 bg-slate-900/50 backdrop-blur text-slate-400 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-sky-500/10 hover:text-sky-400 hover:border-sky-500/30 transition-all text-center flex items-center gap-2"
                >
                  <Lock className="w-3 h-3" /> Área Restrita
                </button>
              )}
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
                  <div className="w-14 h-14 md:w-20 md:h-20 rounded-full flex items-center justify-center shrink-0 overflow-hidden bg-slate-950/50 border border-slate-800">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Tsunami Logo" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white font-black text-xl md:text-2xl">TS</span>
                    )}
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

                {isAdmin && (
                  <div className="bg-amber-950/30 border border-amber-500/40 rounded-2xl p-3.5 mb-6 flex items-center justify-between gap-3 shadow-md">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">⭐</span>
                      <div>
                        <span className="text-xs font-black uppercase tracking-wider text-amber-300 block">
                          Modo Professor: Ajuste Rápido de Nível
                        </span>
                        <span className="text-[11px] text-slate-300">
                          Clique nas estrelas de qualquer participante para alterar o nível com 1 clique.
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-amber-300 font-black uppercase shrink-0 bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/30">
                      1 Clique
                    </span>
                  </div>
                )}
                
                {classes.filter(c => c.isOpen).length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center bg-slate-950/50 rounded-2xl border border-slate-800/50">
                    <Lock className="w-8 h-8 text-slate-600 mb-4" />
                    <p className="text-slate-500 font-black tracking-widest uppercase text-xs md:text-sm">INSCRIÇÕES FECHADAS<br/>AGUARDE A LIBERAÇÃO</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {classes.filter(c => c.isOpen).map(cls => (
                      <div key={cls.id} className="relative">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                          <div>
                            <h3 className="text-lg md:text-xl font-black text-white uppercase tracking-tight">
                              {cls.name}
                            </h3>
                            <span className="text-sky-400/80 text-xs font-bold tracking-widest uppercase">
                              {cls.description}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveDrawClassId(cls.id)}
                            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shrink-0 w-fit ${
                              savedDraws[cls.id]
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                                : 'bg-slate-850 hover:bg-slate-800 text-sky-400 border border-slate-700/60 hover:border-sky-500/40'
                            }`}
                          >
                            <Shuffle className="w-3.5 h-3.5 text-sky-400" />
                            {savedDraws[cls.id] ? 'Ver Times Sorteados 📋' : 'Sortear Linhas ⚖️'}
                          </button>
                        </div>

                        {savedDraws[cls.id] && (
                          <div 
                            onClick={() => setActiveDrawClassId(cls.id)}
                            className="cursor-pointer bg-gradient-to-r from-emerald-950/40 via-slate-900 to-sky-950/40 border border-emerald-500/30 hover:border-emerald-500/60 rounded-2xl p-3.5 mb-4 flex items-center justify-between gap-3 transition-all group shadow-sm"
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
                            <span className="text-xs font-bold text-sky-400 group-hover:underline flex items-center gap-1">
                              Ver Escalação <ArrowRight className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        )}
                        
                        <div className="space-y-2">
                          {(() => {
                            const participants = getClassParticipants(cls.id);
                            const maxVagas = cls.multiplier * 5;
                            const isFull = participants.length >= maxVagas;
                            
                            if (participants.length === 0) {
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
                                {participants.map((p, idx) => {
                                  const isWaitlist = idx >= maxVagas;
                                  return (
                                    <div 
                                      key={p.key} 
                                      className={`rounded-2xl p-4 flex items-center justify-between border transition-all ${
                                        isWaitlist 
                                          ? 'bg-rose-950/10 border-rose-900/30' 
                                          : p.isGuest 
                                            ? 'bg-amber-950/25 border-amber-500/40 shadow-sm shadow-amber-500/5' 
                                            : 'bg-slate-800/40 border-slate-700/50'
                                      }`}
                                    >
                                      <div className="flex items-center gap-3 md:gap-4 w-full">
                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                                          isWaitlist 
                                            ? 'bg-rose-900/30 text-rose-400' 
                                            : p.isGuest 
                                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                                              : 'bg-slate-950 text-slate-400'
                                        }`}>
                                          {idx + 1}
                                        </div>
                                        <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2 flex-1 min-w-0">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className={`text-xs md:text-sm font-black uppercase truncate ${
                                              isWaitlist 
                                                ? 'text-rose-200/70' 
                                                : p.isGuest 
                                                  ? 'text-amber-300' 
                                                  : 'text-emerald-400'
                                            }`}>
                                              {p.name}
                                            </span>
                                            {p.isGuest && (
                                              <span className="text-[10px] md:text-xs font-black text-amber-400 uppercase tracking-wide shrink-0">
                                                (CONVIDADO DE {p.guestOf})
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        
                                        {/* Stars Badge - with 1-click admin adjustment */}
                                        <div className="flex items-center gap-2 shrink-0 ml-auto">
                                          {isAdmin ? (
                                            <div className="flex items-center gap-1 bg-slate-950/90 border border-amber-500/40 hover:border-amber-400 px-2 py-1 rounded-xl shadow-sm transition-all">
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
                                                  : 'bg-slate-950/80 border-slate-700/60 text-sky-300'
                                              }`}
                                              title={`Nível: ${SKILL_LEVEL_OPTIONS.find(o => o.level === p.level)?.label || 'Regular'} (Clique para gerenciar como Professor)`}
                                            >
                                              {getSkillStars(p.level)}
                                            </button>
                                          )}
                                          {isWaitlist && (
                                            <span className="text-[9px] font-black tracking-widest uppercase text-rose-400 border border-rose-400/30 px-2 py-1 rounded-md shrink-0">
                                              Espera
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                                <div className="pt-3 flex justify-between items-center px-1">
                                  <span className={`text-[10px] font-black uppercase tracking-widest ${isFull ? 'text-rose-500' : 'text-emerald-500'}`}>
                                    {isFull ? 'TURMA LOTADA' : 'VAGAS DISPONÍVEIS'}
                                  </span>
                                  <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest bg-slate-900 px-3 py-1 rounded-lg">
                                    {Math.min(participants.length, maxVagas)} / {maxVagas}
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

              {/* Justification CTA at the bottom */}
              {absenceJustificationOpen && (
                <div className="mt-8 relative group">
                  <div className="absolute inset-0 rounded-[2rem] blur opacity-25 transition-opacity duration-500 bg-rose-500 group-hover:opacity-40"></div>
                  <div className="relative bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-[2rem] p-6 text-center shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-left">
                      <h3 className="text-rose-400 font-black text-sm md:text-base uppercase tracking-widest mb-1">Não vai poder ir?</h3>
                      <p className="text-slate-400 text-xs font-medium">Avise a organização justificando sua ausência.</p>
                    </div>
                    <button 
                      onClick={startJustificationFlow}
                      className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 border border-rose-500/30 hover:border-rose-500/50 text-rose-300 font-black text-xs uppercase tracking-widest py-3 px-6 rounded-xl transition-all"
                    >
                      Justificar Ausência
                    </button>
                  </div>
                </div>
              )}

            </div>
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

      {adminQuickLoginOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <h3 className="text-base font-black text-white uppercase tracking-tight">
                  Modo Professor
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAdminQuickLoginOpen(false);
                  setQuickAdminPassword('');
                  setQuickAdminError('');
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Autentique-se como professor para ajustar o nível de estrelas dos inscritos diretamente na página inicial com 1 clique.
            </p>

            <form onSubmit={handleQuickAdminLogin} className="space-y-3">
              <input
                type="password"
                value={quickAdminPassword}
                onChange={(e) => setQuickAdminPassword(e.target.value)}
                placeholder="Digite a senha (admin123)"
                autoFocus
                className="w-full bg-slate-950 border border-slate-700/60 rounded-xl px-4 py-3 text-white text-center tracking-widest text-sm focus:outline-none focus:border-amber-400 transition-all placeholder:tracking-normal placeholder:text-slate-600"
              />
              {quickAdminError && (
                <p className="text-rose-400 text-xs font-bold text-center">{quickAdminError}</p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setAdminQuickLoginOpen(false);
                    setQuickAdminPassword('');
                    setQuickAdminError('');
                  }}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-700 text-slate-400 font-bold text-xs uppercase hover:bg-slate-800 transition-colors"
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

              <div className="pt-2 border-t border-slate-800 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setAdminQuickLoginOpen(false);
                    setView('adminLogin');
                  }}
                  className="text-[11px] text-sky-400 hover:underline uppercase tracking-wide font-bold"
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
