/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  User, 
  CheckCircle2, 
  History, 
  Camera, 
  Send, 
  Calendar, 
  Clock, 
  AlertCircle,
  ChevronRight,
  X,
  Trash2,
  Users,
  Check,
  MoreHorizontal,
  FileSpreadsheet,
  FileText,
  Edit2,
  ChevronDown,
  ChevronUp,
  Settings,
  Plus,
  Save,
  PlusCircle,
  Upload,
  Download,
  RefreshCw
} from 'lucide-react';
import { 
  format, 
  isSameDay, 
  parseISO, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  addMonths, 
  subMonths,
  isToday
} from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { utils, writeFile } from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { App as CapacitorApp } from '@capacitor/app';
import { AttendanceRecord, AttendanceStatus, Student, ClassData } from './types';
import { AttendanceStorage } from './lib/storage';
import { cn } from './lib/utils';

export default function App() {
  const [activeTab, setActiveTab] = useState<'input' | 'history' | 'manage'>('input');
  
  useEffect(() => {
    // Handle Android Back Button
    const backListener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (!canGoBack) {
        CapacitorApp.exitApp();
      } else {
        window.history.back();
      }
    });

    return () => {
      backListener.then(l => l.remove());
    };
  }, []);

  const [classes, setClasses] = useState<ClassData[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassData | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
  // History view state
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [expandedClass, setExpandedClass] = useState<string | null>(null);

  // Management state
  const [isAddingClass, setIsAddingClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [newStudentName, setNewStudentName] = useState('');
  const [bulkStudentNames, setBulkStudentNames] = useState('');
  const [showBulkInput, setShowBulkInput] = useState<string | null>(null);

  // Modal state for proof upload
  const [pendingRecord, setPendingRecord] = useState<{ student: Student; status: AttendanceStatus; existingId?: string } | null>(null);
  const [proofImage, setProofImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit mode for input
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      const loadedClasses = await AttendanceStorage.getClasses();
      setClasses(loadedClasses);
      if (loadedClasses.length > 0) {
        setSelectedClass(loadedClasses[0]);
      }
      const loadedRecords = await AttendanceStorage.getAll();
      setRecords(loadedRecords);
    };
    loadData();
  }, []);

  const todayRecords = useMemo(() => {
    return records.filter(r => isSameDay(parseISO(r.timestamp), new Date()));
  }, [records]);

  const groupedRecordsByDate = useMemo(() => {
    const groups: Record<string, Record<string, AttendanceRecord[]>> = {};
    records.forEach(record => {
      const dateKey = format(parseISO(record.timestamp), 'yyyy-MM-dd');
      if (!groups[dateKey]) {
        groups[dateKey] = {};
      }
      if (!groups[dateKey][record.className]) {
        groups[dateKey][record.className] = [];
      }
      groups[dateKey][record.className].push(record);
    });
    return groups;
  }, [records]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProofImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const submitAttendance = async (student: Student, status: AttendanceStatus, proof?: string, existingId?: string) => {
    setIsSubmitting(true);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const newRecord: AttendanceRecord = {
      id: existingId || crypto.randomUUID(),
      studentName: student.name,
      className: selectedClass.name,
      status,
      timestamp: new Date().toISOString(),
      proofImage: proof,
    };

    AttendanceStorage.save(newRecord);
    setRecords(prev => {
      const filtered = prev.filter(r => r.id !== newRecord.id);
      return [newRecord, ...filtered];
    });
    
    setIsSubmitting(false);
    setShowSuccess(true);
    setEditingStudentId(null);
    setTimeout(() => setShowSuccess(false), 2000);
  };

  const handleAttendanceAction = (student: Student, status: AttendanceStatus) => {
    if (!selectedClass) return;
    const existing = todayRecords.find(r => r.studentName === student.name && r.className === selectedClass.name);
    
    if (status === 'Sakit' || status === 'Izin') {
      setPendingRecord({ student, status, existingId: existing?.id });
      setProofImage(existing?.proofImage || null);
    } else {
      submitAttendance(student, status, undefined, existing?.id);
    }
  };

  const handleAddClass = () => {
    if (!newClassName.trim()) return;
    const newClass: ClassData = {
      id: crypto.randomUUID(),
      name: newClassName,
      students: []
    };
    const updated = [...classes, newClass];
    setClasses(updated);
    AttendanceStorage.saveClasses(updated);
    setNewClassName('');
    setIsAddingClass(false);
    if (!selectedClass) setSelectedClass(newClass);
  };

  const handleDeleteClass = (id: string) => {
    if (window.confirm('Hapus kelas ini beserta seluruh siswanya?')) {
      const updated = classes.filter(c => c.id !== id);
      setClasses(updated);
      AttendanceStorage.saveClasses(updated);
      if (selectedClass?.id === id) {
        setSelectedClass(updated[0] || null);
      }
    }
  };

  const handleAddStudent = (classId: string) => {
    if (!newStudentName.trim()) return;
    const updated = classes.map(c => {
      if (c.id === classId) {
        return {
          ...c,
          students: [...c.students, { id: crypto.randomUUID(), name: newStudentName }]
        };
      }
      return c;
    });
    setClasses(updated);
    AttendanceStorage.saveClasses(updated);
    setNewStudentName('');
    if (selectedClass?.id === classId) {
      setSelectedClass(updated.find(c => c.id === classId) || null);
    }
  };

  const handleDeleteStudent = (classId: string, studentId: string) => {
    const updated = classes.map(c => {
      if (c.id === classId) {
        return {
          ...c,
          students: c.students.filter(s => s.id !== studentId)
        };
      }
      return c;
    });
    setClasses(updated);
    AttendanceStorage.saveClasses(updated);
    if (selectedClass?.id === classId) {
      setSelectedClass(updated.find(c => c.id === classId) || null);
    }
  };

  const handleBulkAddStudents = (classId: string) => {
    if (!bulkStudentNames.trim()) return;
    const names = bulkStudentNames.split(/[\n,]+/).map(n => n.trim()).filter(n => n !== '');
    const newStudents = names.map(name => ({
      id: crypto.randomUUID(),
      name
    }));

    const updated = classes.map(c => {
      if (c.id === classId) {
        return {
          ...c,
          students: [...c.students, ...newStudents]
        };
      }
      return c;
    });

    setClasses(updated);
    AttendanceStorage.saveClasses(updated);
    setBulkStudentNames('');
    setShowBulkInput(null);
    if (selectedClass?.id === classId) {
      setSelectedClass(updated.find(c => c.id === classId) || null);
    }
  };

  const resetToDefault = () => {
    if (window.confirm('Kembalikan ke data awal? Ini akan menghapus semua kelas dan siswa yang Anda buat.')) {
      localStorage.removeItem('siswa_hadir_classes_v1');
      const loaded = AttendanceStorage.getClasses();
      setClasses(loaded);
      setSelectedClass(loaded[0] || null);
    }
  };

  const handleModalSubmit = () => {
    if (pendingRecord) {
      submitAttendance(pendingRecord.student, pendingRecord.status, proofImage || undefined, pendingRecord.existingId);
      setPendingRecord(null);
      setProofImage(null);
    }
  };

  const clearHistory = () => {
    if (window.confirm('Hapus semua riwayat absensi?')) {
      AttendanceStorage.clear();
      setRecords([]);
    }
  };

  const exportToExcel = () => {
    const data = records.map(r => ({
      'Nama Siswa': r.studentName,
      'Kelas': r.className,
      'Status': r.status,
      'Tanggal': format(parseISO(r.timestamp), 'd MMM yyyy'),
      'Waktu': format(parseISO(r.timestamp), 'HH:mm')
    }));

    const ws = utils.json_to_sheet(data);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Laporan Absensi');
    writeFile(wb, `Laporan_Absensi_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text('Laporan Absensi Siswa', 14, 15);
    doc.setFontSize(10);
    doc.text(`Dicetak pada: ${format(new Date(), 'd MMMM yyyy HH:mm', { locale: localeID })}`, 14, 22);

    const tableData = records.map(r => [
      r.studentName,
      r.className,
      r.status,
      format(parseISO(r.timestamp), 'd MMM yyyy'),
      format(parseISO(r.timestamp), 'HH:mm')
    ]);

    autoTable(doc, {
      head: [['Nama Siswa', 'Kelas', 'Status', 'Tanggal', 'Waktu']],
      body: tableData,
      startY: 28,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235] }
    });

    doc.save(`Laporan_Absensi_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC] text-[#1A1C1E] font-sans selection:bg-blue-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
            <CheckCircle2 className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">SiswaHadir</h1>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Presensi Digital</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-gray-600">
            {format(new Date(), 'EEEE, d MMMM', { locale: localeID })}
          </p>
        </div>
      </header>

      <main className="max-w-md mx-auto pb-32">
        <AnimatePresence mode="wait">
          {activeTab === 'input' ? (
            <motion.div 
              key="input"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-6 space-y-6"
            >
              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-gray-900">Input Absensi</h2>
                <p className="text-sm text-gray-500">Pilih kelas dan tandai kehadiran siswa.</p>
              </div>

              {/* Class Selector Tabs */}
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {classes.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedClass(c)}
                    className={cn(
                      "px-6 py-2.5 rounded-full font-bold text-sm whitespace-nowrap transition-all border",
                      selectedClass?.id === c.id 
                        ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100" 
                        : "bg-white text-gray-500 border-gray-100 hover:border-gray-200"
                    )}
                  >
                    {c.name}
                  </button>
                ))}
                {classes.length === 0 && (
                  <p className="text-sm text-gray-400 py-2">Belum ada kelas. Tambahkan di tab Kelola.</p>
                )}
              </div>

              {/* Student List */}
              <div className="space-y-4">
                {selectedClass && (
                  <>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                      <Users className="w-3 h-3" /> Daftar Siswa {selectedClass.name}
                    </label>
                    
                    <div className="space-y-3">
                      {selectedClass.students.length === 0 ? (
                        <div className="bg-white p-8 rounded-2xl border border-dashed border-gray-200 text-center">
                          <p className="text-sm text-gray-400">Belum ada siswa di kelas ini.</p>
                        </div>
                      ) : (
                        selectedClass.students.map((student) => {
                          const existingRecord = todayRecords.find(r => r.studentName === student.name && r.className === selectedClass.name);
                          const isEditing = editingStudentId === student.id;

                          return (
                            <div 
                              key={student.id}
                              className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-4"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400">
                                    <User className="w-5 h-5" />
                                  </div>
                                  <h3 className="font-bold text-gray-800">{student.name}</h3>
                                </div>
                                {existingRecord && !isEditing && (
                                  <button 
                                    onClick={() => setEditingStudentId(student.id)}
                                    className="flex items-center gap-1 text-blue-600 text-xs font-bold hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-all"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    Edit
                                  </button>
                                )}
                              </div>
                              
                              {existingRecord && !isEditing ? (
                                <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-100">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                    <span className="text-sm font-medium text-gray-600">Sudah Absen</span>
                                  </div>
                                  <span className={cn(
                                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                    existingRecord.status === 'Hadir' ? "bg-green-100 text-green-700" : 
                                    existingRecord.status === 'Sakit' ? "bg-orange-100 text-orange-700" :
                                    existingRecord.status === 'Izin' ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
                                  )}>
                                    {existingRecord.status}
                                  </span>
                                </div>
                              ) : (
                                <div className="grid grid-cols-4 gap-2">
                                  {(['Hadir', 'Sakit', 'Izin', 'Alpa'] as AttendanceStatus[]).map((s) => (
                                    <button
                                      key={s}
                                      onClick={() => handleAttendanceAction(student, s)}
                                      className={cn(
                                        "py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all",
                                        s === 'Hadir' ? "border-green-100 text-green-600 hover:bg-green-50" : 
                                        s === 'Sakit' ? "border-orange-100 text-orange-600 hover:bg-orange-50" :
                                        s === 'Izin' ? "border-blue-100 text-blue-600 hover:bg-blue-50" : 
                                        "border-red-100 text-red-600 hover:bg-red-50"
                                      )}
                                    >
                                      {s}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          ) : activeTab === 'history' ? (
            <motion.div 
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-6 space-y-6"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-bold text-gray-900">Riwayat</h2>
                    <p className="text-sm text-gray-500">Pilih tanggal untuk melihat data.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {records.length > 0 && (
                      <button 
                        onClick={clearHistory}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Full Calendar View */}
                <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-4 space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <h3 className="font-bold text-gray-800 capitalize">
                      {format(currentMonth, 'MMMM yyyy', { locale: localeID })}
                    </h3>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                        className="p-2 hover:bg-gray-50 rounded-xl text-gray-400"
                      >
                        <ChevronRight className="w-5 h-5 rotate-180" />
                      </button>
                      <button 
                        onClick={() => setCurrentMonth(new Date())}
                        className="p-2 hover:bg-gray-50 rounded-xl text-blue-600 font-bold text-[10px] uppercase tracking-wider"
                      >
                        Hari Ini
                      </button>
                      <button 
                        onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                        className="p-2 hover:bg-gray-50 rounded-xl text-gray-400"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(day => (
                      <div key={day} className="text-center py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        {day}
                      </div>
                    ))}
                    {calendarDays.map((date) => {
                      const dateKey = format(date, 'yyyy-MM-dd');
                      const isSelected = selectedHistoryDate === dateKey;
                      const isCurrentMonth = isSameMonth(date, currentMonth);
                      const hasData = !!groupedRecordsByDate[dateKey];
                      const isTodayDate = isToday(date);

                      return (
                        <button
                          key={dateKey}
                          onClick={() => setSelectedHistoryDate(dateKey)}
                          className={cn(
                            "aspect-square flex flex-col items-center justify-center rounded-2xl transition-all relative text-sm font-bold",
                            !isCurrentMonth && "opacity-20",
                            isSelected 
                              ? "bg-blue-600 text-white shadow-lg shadow-blue-200" 
                              : isTodayDate 
                                ? "bg-blue-50 text-blue-600" 
                                : "hover:bg-gray-50 text-gray-700"
                          )}
                        >
                          {format(date, 'd')}
                          {hasData && (
                            <div className={cn(
                              "absolute bottom-1.5 w-1 h-1 rounded-full",
                              isSelected ? "bg-white" : "bg-blue-500"
                            )} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Export Buttons */}
              {records.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={exportToExcel}
                    className="flex items-center justify-center gap-2 py-3 bg-green-50 text-green-700 rounded-2xl font-bold text-sm border border-green-100 hover:bg-green-100 transition-all"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Excel
                  </button>
                  <button
                    onClick={exportToPDF}
                    className="flex items-center justify-center gap-2 py-3 bg-red-50 text-red-700 rounded-2xl font-bold text-sm border border-red-100 hover:bg-red-100 transition-all"
                  >
                    <FileText className="w-4 h-4" />
                    PDF
                  </button>
                </div>
              )}

              <div className="space-y-4">
                {!groupedRecordsByDate[selectedHistoryDate] ? (
                  <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                      <Calendar className="w-8 h-8 text-gray-300" />
                    </div>
                    <div>
                      <p className="text-gray-400 font-medium">Tidak ada data absensi</p>
                      <p className="text-xs text-gray-300">untuk tanggal {format(parseISO(selectedHistoryDate), 'd MMMM yyyy', { locale: localeID })}</p>
                    </div>
                  </div>
                ) : (
                  Object.entries(groupedRecordsByDate[selectedHistoryDate]).map(([className, classRecordsData]) => {
                    const classRecords = classRecordsData as AttendanceRecord[];
                    const isClassExpanded = expandedClass === `${selectedHistoryDate}-${className}`;
                    
                    return (
                      <div key={className} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                        <button
                          onClick={() => setExpandedClass(isClassExpanded ? null : `${selectedHistoryDate}-${className}`)}
                          className="w-full p-5 flex items-center justify-between hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                              <Users className="w-6 h-6" />
                            </div>
                            <div className="text-left">
                              <h3 className="font-bold text-gray-900">{className}</h3>
                              <p className="text-xs text-gray-400 font-medium">
                                {classRecords.length} Siswa Terdata
                              </p>
                            </div>
                          </div>
                          {isClassExpanded ? <ChevronUp className="w-5 h-5 text-gray-300" /> : <ChevronDown className="w-5 h-5 text-gray-300" />}
                        </button>

                        <AnimatePresence>
                          {isClassExpanded && (
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: 'auto' }}
                              exit={{ height: 0 }}
                              className="overflow-hidden border-t border-gray-50 bg-gray-50/30"
                            >
                              <div className="p-4 space-y-2">
                                {classRecords.map((record) => (
                                  <div 
                                    key={record.id}
                                    className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 shadow-sm"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400">
                                        <User className="w-5 h-5" />
                                      </div>
                                      <div>
                                        <p className="text-sm font-bold text-gray-800">{record.studentName}</p>
                                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium">
                                          <Clock className="w-3 h-3" />
                                          {format(parseISO(record.timestamp), 'HH:mm')}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      {record.proofImage && (
                                        <div className="w-10 h-10 rounded-xl overflow-hidden border border-gray-100 shadow-sm">
                                          <img src={record.proofImage} className="w-full h-full object-cover" alt="Proof" />
                                        </div>
                                      )}
                                      <span className={cn(
                                        "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                        record.status === 'Hadir' ? "bg-green-100 text-green-700" : 
                                        record.status === 'Sakit' ? "bg-orange-100 text-orange-700" :
                                        record.status === 'Izin' ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
                                      )}>
                                        {record.status}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="manage"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-6 space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h2 className="text-2xl font-bold text-gray-900">Kelola Data</h2>
                  <p className="text-sm text-gray-500">Atur daftar kelas dan siswa Anda.</p>
                </div>
                <button 
                  onClick={resetToDefault}
                  className="p-2 text-gray-400 hover:text-blue-600 rounded-xl transition-colors"
                  title="Reset ke Default"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              </div>

              {/* Add Class Form */}
              {!isAddingClass ? (
                <button 
                  onClick={() => setIsAddingClass(true)}
                  className="w-full py-4 border-2 border-dashed border-gray-200 rounded-2xl flex items-center justify-center gap-2 text-gray-400 font-bold hover:border-blue-300 hover:text-blue-500 transition-all"
                >
                  <PlusCircle className="w-5 h-5" />
                  Tambah Kelas Baru
                </button>
              ) : (
                <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-lg shadow-blue-50 space-y-3">
                  <input 
                    type="text"
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    placeholder="Nama Kelas (contoh: 10 IPA 1)"
                    className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button 
                      onClick={handleAddClass}
                      className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm"
                    >
                      Simpan
                    </button>
                    <button 
                      onClick={() => setIsAddingClass(false)}
                      className="px-4 py-3 bg-gray-100 text-gray-500 rounded-xl font-bold text-sm"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}

              {/* Classes List */}
              <div className="space-y-4">
                {classes.map((c) => (
                  <div key={c.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-5 flex items-center justify-between border-b border-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                          <Users className="w-5 h-5" />
                        </div>
                        <h3 className="font-bold text-gray-800">{c.name}</h3>
                      </div>
                      <button 
                        onClick={() => handleDeleteClass(c.id)}
                        className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="p-5 space-y-4">
                      {/* Student List in Class */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                          Daftar Siswa ({c.students.length})
                        </span>
                        <button 
                          onClick={() => setShowBulkInput(showBulkInput === c.id ? null : c.id)}
                          className="text-[10px] font-bold text-blue-600 uppercase tracking-wider hover:underline"
                        >
                          {showBulkInput === c.id ? 'Tutup Impor' : 'Impor Massal'}
                        </button>
                      </div>

                      {showBulkInput === c.id && (
                        <div className="space-y-2 bg-blue-50 p-3 rounded-2xl border border-blue-100">
                          <p className="text-[10px] text-blue-600 font-medium">Masukkan nama siswa (pisahkan dengan koma atau baris baru):</p>
                          <textarea 
                            value={bulkStudentNames}
                            onChange={(e) => setBulkStudentNames(e.target.value)}
                            className="w-full p-3 text-sm bg-white rounded-xl border border-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                            placeholder="Contoh:&#10;Andi Saputra&#10;Beni Irawan&#10;Cici Amalia"
                          />
                          <button 
                            onClick={() => handleBulkAddStudents(c.id)}
                            className="w-full py-2 bg-blue-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2"
                          >
                            <Upload className="w-3 h-3" />
                            Impor Sekarang
                          </button>
                        </div>
                      )}

                      <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                        {c.students.length === 0 ? (
                          <p className="text-xs text-gray-400 text-center py-4">Belum ada siswa.</p>
                        ) : (
                          c.students.map((s) => (
                            <div key={s.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                              <span className="text-sm font-medium text-gray-700">{s.name}</span>
                              <button 
                                onClick={() => handleDeleteStudent(c.id, s.id)}
                                className="text-gray-300 hover:text-red-400"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Add Student Form */}
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          value={editingClassId === c.id ? newStudentName : ''}
                          onChange={(e) => {
                            setEditingClassId(c.id);
                            setNewStudentName(e.target.value);
                          }}
                          onFocus={() => setEditingClassId(c.id)}
                          placeholder="Nama Siswa Baru..."
                          className="flex-1 p-2.5 bg-gray-50 rounded-xl border border-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button 
                          onClick={() => handleAddStudent(c.id)}
                          className="p-2.5 bg-blue-600 text-white rounded-xl"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Navigation Bar */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-48px)] max-w-md bg-white/90 backdrop-blur-xl border border-gray-100 rounded-3xl shadow-2xl shadow-blue-900/10 p-2 flex items-center gap-2 z-30">
        <button
          onClick={() => setActiveTab('input')}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-2xl transition-all font-bold text-[10px] uppercase tracking-wider",
            activeTab === 'input' ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "text-gray-400 hover:text-gray-600"
          )}
        >
          <Users className="w-4 h-4" />
          Input
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-2xl transition-all font-bold text-[10px] uppercase tracking-wider",
            activeTab === 'history' ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "text-gray-400 hover:text-gray-600"
          )}
        >
          <History className="w-4 h-4" />
          Riwayat
        </button>
        <button
          onClick={() => setActiveTab('manage')}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-2xl transition-all font-bold text-[10px] uppercase tracking-wider",
            activeTab === 'manage' ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "text-gray-400 hover:text-gray-600"
          )}
        >
          <Settings className="w-4 h-4" />
          Kelola
        </button>
      </nav>

      {/* Proof Upload Modal */}
      <AnimatePresence>
        {pendingRecord && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPendingRecord(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="relative w-full max-w-md bg-white rounded-t-[32px] sm:rounded-[32px] p-6 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-gray-900">Upload Bukti {pendingRecord.status}</h3>
                  <p className="text-sm text-gray-500">{pendingRecord.student.name}</p>
                </div>
                <button 
                  onClick={() => setPendingRecord(null)}
                  className="p-2 bg-gray-100 rounded-full text-gray-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div 
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "relative w-full aspect-video rounded-3xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden",
                  proofImage ? "border-blue-500" : "border-gray-200 hover:border-gray-300 bg-gray-50"
                )}
              >
                {proofImage ? (
                  <>
                    <img src={proofImage} className="w-full h-full object-cover" alt="Proof" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <p className="text-white text-xs font-medium">Ganti Foto</p>
                    </div>
                  </>
                ) : (
                  <>
                    <Camera className="w-10 h-10 text-gray-300 mb-2" />
                    <p className="text-sm text-gray-400 font-medium">Klik untuk ambil foto / upload</p>
                  </>
                )}
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                className="hidden" 
              />

              <button
                onClick={handleModalSubmit}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-xl shadow-blue-200 active:scale-[0.98] transition-all"
              >
                Simpan Absensi
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Success Toast */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className="fixed bottom-24 left-1/2 z-[50] bg-green-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 font-bold"
          >
            <CheckCircle2 className="w-5 h-5" />
            Absensi Berhasil!
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
