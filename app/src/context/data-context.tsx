import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  Student,
  Visit,
  SyllabusItem,
  Material,
  Announcement,
  FollowUpTask,
  Level,
  CallOutcome,
  VisitMethod,
  ToggleVisitResponse,
  CallLog,
} from '../types/database';
import {
  INITIAL_STUDENTS,
  INITIAL_SYLLABUS,
  INITIAL_LEVELS,
  INITIAL_MATERIALS,
  INITIAL_ANNOUNCEMENTS,
  INITIAL_TASKS,
  INITIAL_VISITS,
  INITIAL_STUDENT_PROGRESS,
  INITIAL_CALL_LOGS,
} from '../data/mock-seed';

interface DataContextType {
  students: Student[];
  visits: Visit[];
  syllabus: SyllabusItem[];
  levels: Level[];
  materials: Material[];
  announcements: Announcement[];
  followUpTasks: FollowUpTask[];
  studentProgress: Record<string, number[]>;
  callLogs: CallLog[];
  isLoading: boolean;
  toggleVisit: (studentId: string, method?: VisitMethod) => Promise<ToggleVisitResponse>;
  scanQr: (qrToken: string) => Promise<ToggleVisitResponse>;
  logCall: (
    studentId: string,
    outcome: CallOutcome,
    reason: string,
    comment: string,
    nextDate?: string
  ) => Promise<{ success: boolean; error?: string }>;
  registerStudent: (data: {
    full_name: string;
    dob?: string;
    phone?: string;
    email?: string;
    area?: string;
    pincode?: string;
    level_id: number;
    guardian_name?: string;
    guardian_relation?: string;
  }) => Promise<{ success: boolean; student?: Student; error?: string }>;
  tickSyllabus: (itemId: number, completed: boolean) => Promise<void>;
  tickStudentSyllabus: (studentId: string, itemId: number, completed: boolean) => Promise<void>;
  promoteStudent: (studentId: string, toLevelId: number) => Promise<{ success: boolean; error?: string }>;
  refreshData: () => Promise<void>;
}

const DataContext = createContext<DataContextType>({
  students: [],
  visits: [],
  syllabus: [],
  levels: [],
  materials: [],
  announcements: [],
  followUpTasks: [],
  studentProgress: {},
  callLogs: [],
  isLoading: false,
  toggleVisit: async () => ({ action: 'unknown' }),
  scanQr: async () => ({ action: 'unknown' }),
  logCall: async () => ({ success: false }),
  registerStudent: async () => ({ success: false }),
  tickSyllabus: async () => {},
  tickStudentSyllabus: async () => {},
  promoteStudent: async () => ({ success: false }),
  refreshData: async () => {},
});

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [students, setStudents] = useState<Student[]>(INITIAL_STUDENTS);
  const [visits, setVisits] = useState<Visit[]>(INITIAL_VISITS);
  const [syllabus, setSyllabus] = useState<SyllabusItem[]>(INITIAL_SYLLABUS);
  const [levels] = useState<Level[]>(INITIAL_LEVELS);
  const [materials, setMaterials] = useState<Material[]>(INITIAL_MATERIALS);
  const [announcements] = useState<Announcement[]>(INITIAL_ANNOUNCEMENTS);
  const [followUpTasks, setFollowUpTasks] = useState<FollowUpTask[]>(INITIAL_TASKS);
  const [studentProgress, setStudentProgress] = useState<Record<string, number[]>>(INITIAL_STUDENT_PROGRESS);
  const [callLogs, setCallLogs] = useState<CallLog[]>(INITIAL_CALL_LOGS);
  const [isLoading, setIsLoading] = useState(false);

  const refreshData = async () => {
    if (!isSupabaseConfigured) return;
    setIsLoading(true);
    try {
      const [
        { data: sData },
        { data: vData },
        { data: yData },
        { data: mData },
        { data: tData },
        { data: cData },
      ] = await Promise.all([
        supabase.from('students').select('*').order('joined_on', { ascending: false }),
        supabase.from('visits').select('*').order('check_in', { ascending: false }).limit(50),
        supabase.from('syllabus_items').select('*').order('sort', { ascending: true }),
        supabase.from('materials').select('*').order('created_at', { ascending: false }),
        supabase.from('follow_up_tasks').select('*').is('done_at', null).order('due_on', { ascending: true }),
        supabase.from('call_logs').select('*').order('called_at', { ascending: false }),
      ]);

      if (sData && sData.length > 0) setStudents(sData as Student[]);
      if (vData && vData.length > 0) setVisits(vData as Visit[]);
      if (yData && yData.length > 0) setSyllabus(yData as SyllabusItem[]);
      if (mData && mData.length > 0) setMaterials(mData as Material[]);
      if (tData && tData.length > 0) setFollowUpTasks(tData as FollowUpTask[]);
      if (cData && cData.length > 0) setCallLogs(cData as CallLog[]);
    } catch (err) {
      console.warn('Error loading live data from Supabase:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    if (isSupabaseConfigured) {
      (async () => {
        if (active) {
          await refreshData();
        }
      })();
    }
    return () => {
      active = false;
    };
  }, []);

  const toggleVisit = async (studentId: string, method: VisitMethod = 'manual'): Promise<ToggleVisitResponse> => {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.rpc('toggle_visit', {
          p_student: studentId,
          p_method: method,
        });
        if (error) throw error;
        await refreshData();
        return data as ToggleVisitResponse;
      } catch (err: any) {
        console.error('toggle_visit error:', err);
        return { action: 'unknown' };
      }
    }

    // In-memory demo simulation
    const student = students.find((s) => s.id === studentId);
    if (!student) return { action: 'unknown' };

    const wasCheckedIn = Boolean(student.is_checked_in);
    const action = wasCheckedIn ? 'out' : 'in';
    const nowIso = new Date().toISOString();

    setStudents((prev) =>
      prev.map((s) => {
        if (s.id === studentId) {
          return {
            ...s,
            is_checked_in: !wasCheckedIn,
            status: !wasCheckedIn ? 'active' : s.status,
            paused_until: !wasCheckedIn ? undefined : s.paused_until,
          };
        }
        return s;
      })
    );

    if (action === 'in') {
      const newVisit: Visit = {
        id: Date.now(),
        student_id: studentId,
        student_name: student.full_name,
        roll_no: student.roll_no,
        centre_id: student.home_centre_id,
        check_in: nowIso,
        method,
      };
      setVisits((prev) => [newVisit, ...prev]);

      // Complete open follow-up tasks for this student
      setFollowUpTasks((prev) => prev.filter((t) => t.student_id !== studentId));
    } else {
      setVisits((prev) =>
        prev.map((v) => {
          if (v.student_id === studentId && !v.check_out) {
            return { ...v, check_out: nowIso };
          }
          return v;
        })
      );
    }

    return {
      action,
      roll_no: student.roll_no,
      full_name: student.full_name,
      at: nowIso,
    };
  };

  const scanQr = async (qrToken: string): Promise<ToggleVisitResponse> => {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.rpc('scan_qr', { p_qr: qrToken });
      if (error) {
        console.error('scan_qr error:', error);
        return { action: 'unknown' };
      }
      await refreshData();
      return data as ToggleVisitResponse;
    }

    const student = students.find((s) => s.qr_token === qrToken || s.roll_no.toLowerCase() === qrToken.toLowerCase());
    if (!student) return { action: 'unknown' };
    return toggleVisit(student.id, 'qr');
  };

  const logCall = async (
    studentId: string,
    outcome: CallOutcome,
    reason: string,
    comment: string,
    nextDate?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (isSupabaseConfigured) {
      const { error } = await supabase.rpc('log_call', {
        p_student: studentId,
        p_outcome: outcome,
        p_reason: reason,
        p_comment: comment,
        p_next_date: nextDate || null,
      });
      if (error) return { success: false, error: error.message };
      await refreshData();
      return { success: true };
    }

    // Demo state update
    const newLog: CallLog = {
      id: 'demo-call-' + Date.now(),
      student_id: studentId,
      coordinator_id: 'coord-test-1',
      coordinator_name: 'Govinda Dasa',
      called_at: new Date().toISOString(),
      outcome,
      reason,
      comment,
      next_date: nextDate,
    };
    setCallLogs((prev) => [newLog, ...prev]);

    setStudents((prev) =>
      prev.map((s) => {
        if (s.id === studentId) {
          if (outcome === 'paused') {
            return { ...s, status: 'paused', paused_until: nextDate };
          }
          if (outcome === 'discontinued') {
            return { ...s, status: 'left', paused_until: undefined };
          }
        }
        return s;
      })
    );

    // Remove task
    setFollowUpTasks((prev) => prev.filter((t) => t.student_id !== studentId));
    return { success: true };
  };

  const registerStudent = async (data: {
    full_name: string;
    dob?: string;
    phone?: string;
    email?: string;
    area?: string;
    pincode?: string;
    level_id: number;
    guardian_name?: string;
    guardian_relation?: string;
  }): Promise<{ success: boolean; student?: Student; error?: string }> => {
    if (isSupabaseConfigured) {
      const { data: inserted, error } = await supabase
        .from('students')
        .insert({
          full_name: data.full_name,
          dob: data.dob || null,
          phone: data.phone || null,
          email: data.email || null,
          area: data.area || null,
          pincode: data.pincode || null,
          level_id: data.level_id,
        })
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      await refreshData();
      return { success: true, student: inserted as Student };
    }

    // Demo generation
    const currentYear = new Date().getFullYear();
    const nextSeq = String(students.length + 1).padStart(4, '0');
    const newStudent: Student = {
      id: 'demo-student-' + Date.now(),
      roll_no: `MS-${currentYear}-${nextSeq}`,
      full_name: data.full_name,
      dob: data.dob,
      phone: data.phone,
      email: data.email,
      area: data.area,
      pincode: data.pincode,
      level_id: data.level_id,
      status: 'new',
      home_centre_id: 1,
      joined_on: new Date().toISOString().split('T')[0],
      qr_token: 'qr-' + Date.now(),
      created_at: new Date().toISOString(),
      is_checked_in: false,
    };

    setStudents((prev) => [newStudent, ...prev]);
    return { success: true, student: newStudent };
  };

  const tickSyllabus = async (itemId: number, completed: boolean) => {
    setSyllabus((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          return { ...item, completed, done_on: completed ? new Date().toISOString().split('T')[0] : undefined };
        }
        return item;
      })
    );
  };

  const tickStudentSyllabus = async (studentId: string, itemId: number, completed: boolean) => {
    setStudentProgress((prev) => {
      const currentList = prev[studentId] || [];
      const updated = completed
        ? Array.from(new Set([...currentList, itemId]))
        : currentList.filter((id) => id !== itemId);
      return { ...prev, [studentId]: updated };
    });
  };

  const promoteStudent = async (studentId: string, toLevelId: number): Promise<{ success: boolean; error?: string }> => {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('students')
        .update({ level_id: toLevelId })
        .eq('id', studentId);
      if (error) return { success: false, error: error.message };
      await refreshData();
      return { success: true };
    }

    setStudents((prev) =>
      prev.map((s) => {
        if (s.id === studentId) {
          return { ...s, level_id: toLevelId };
        }
        return s;
      })
    );
    return { success: true };
  };

  return (
    <DataContext.Provider
      value={{
        students,
        visits,
        syllabus,
        levels,
        materials,
        announcements,
        followUpTasks,
        studentProgress,
        callLogs,
        isLoading,
        toggleVisit,
        scanQr,
        logCall,
        registerStudent,
        tickSyllabus,
        tickStudentSyllabus,
        promoteStudent,
        refreshData,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => useContext(DataContext);
