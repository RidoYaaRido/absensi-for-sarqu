import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  Image, 
  SafeAreaView, 
  StatusBar, 
  Alert, 
  Modal, 
  Platform,
  ActivityIndicator,
  StyleSheet
} from 'react-native';
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
} from 'lucide-react-native';
import { format, isSameDay, parseISO } from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import * as Crypto from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import { AttendanceRecord, AttendanceStatus, Student, ClassData } from './src/types';
import { AttendanceStorage } from './src/lib/storage';
import { cn } from './src/lib/utils';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';

export default function App() {
  const [activeTab, setActiveTab] = useState<'input' | 'history' | 'manage'>('input');
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassData | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // History view state
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
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

  // Edit mode for input
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const loadedClasses = await AttendanceStorage.getClasses();
      setClasses(loadedClasses);
      if (loadedClasses.length > 0) {
        setSelectedClass(loadedClasses[0]);
      }
      const loadedRecords = await AttendanceStorage.getAll();
      setRecords(loadedRecords);
    } catch (error) {
      console.error('Failed to load data', error);
    } finally {
      setIsLoading(false);
    }
  };

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
    const days = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const date = new Date();
      date.setDate(today.getDate() - i);
      days.push(date);
    }
    return days;
  }, []);

  const submitAttendance = async (student: Student, status: AttendanceStatus, proof?: string, existingId?: string) => {
    if (!selectedClass) return;
    setIsSubmitting(true);
    
    try {
      const newRecord: AttendanceRecord = {
        id: existingId || Crypto.randomUUID(),
        studentName: student.name,
        className: selectedClass.name,
        status,
        timestamp: new Date().toISOString(),
        proofImage: proof,
      };

      await AttendanceStorage.save(newRecord);
      setRecords(prev => {
        const filtered = prev.filter(r => r.id !== newRecord.id);
        return [newRecord, ...filtered];
      });
      
      setShowSuccess(true);
      setEditingStudentId(null);
      setTimeout(() => setShowSuccess(false), 2000);
    } catch (error) {
      Alert.alert('Error', 'Gagal menyimpan absensi');
    } finally {
      setIsSubmitting(false);
    }
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

  const handleAddClass = async () => {
    if (!newClassName.trim()) return;
    const newClass: ClassData = {
      id: Crypto.randomUUID(),
      name: newClassName,
      students: []
    };
    const updated = [...classes, newClass];
    setClasses(updated);
    await AttendanceStorage.saveClasses(updated);
    setNewClassName('');
    setIsAddingClass(false);
    if (!selectedClass) setSelectedClass(newClass);
  };

  const handleDeleteClass = (id: string) => {
    Alert.alert(
      'Hapus Kelas',
      'Hapus kelas ini beserta seluruh siswanya?',
      [
        { text: 'Batal', style: 'cancel' },
        { 
          text: 'Hapus', 
          style: 'destructive',
          onPress: async () => {
            const updated = classes.filter(c => c.id !== id);
            setClasses(updated);
            await AttendanceStorage.saveClasses(updated);
            if (selectedClass?.id === id) {
              setSelectedClass(updated[0] || null);
            }
          }
        }
      ]
    );
  };

  const handleAddStudent = async (classId: string) => {
    if (!newStudentName.trim()) return;
    const updated = classes.map(c => {
      if (c.id === classId) {
        return {
          ...c,
          students: [...c.students, { id: Crypto.randomUUID(), name: newStudentName }]
        };
      }
      return c;
    });
    setClasses(updated);
    await AttendanceStorage.saveClasses(updated);
    setNewStudentName('');
    if (selectedClass?.id === classId) {
      setSelectedClass(updated.find(c => c.id === classId) || null);
    }
  };

  const handleDeleteStudent = async (classId: string, studentId: string) => {
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
    await AttendanceStorage.saveClasses(updated);
    if (selectedClass?.id === classId) {
      setSelectedClass(updated.find(c => c.id === classId) || null);
    }
  };

  const handleBulkAddStudents = async (classId: string) => {
    if (!bulkStudentNames.trim()) return;
    const names = bulkStudentNames.split(/[\n,]+/).map(n => n.trim()).filter(n => n !== '');
    const newStudents = names.map(name => ({
      id: Crypto.randomUUID(),
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
    await AttendanceStorage.saveClasses(updated);
    setBulkStudentNames('');
    setShowBulkInput(null);
    if (selectedClass?.id === classId) {
      setSelectedClass(updated.find(c => c.id === classId) || null);
    }
  };

  const resetToDefault = () => {
    Alert.alert(
      'Reset Data',
      'Kembalikan ke data awal? Ini akan menghapus semua kelas dan siswa yang Anda buat.',
      [
        { text: 'Batal', style: 'cancel' },
        { 
          text: 'Reset', 
          style: 'destructive',
          onPress: async () => {
            await AttendanceStorage.clear();
            await loadInitialData();
          }
        }
      ]
    );
  };

  const handleModalSubmit = () => {
    if (pendingRecord) {
      submitAttendance(pendingRecord.student, pendingRecord.status, proofImage || undefined, pendingRecord.existingId);
      setPendingRecord(null);
      setProofImage(null);
    }
  };

  const clearHistory = () => {
    Alert.alert(
      'Hapus Riwayat',
      'Hapus semua riwayat absensi?',
      [
        { text: 'Batal', style: 'cancel' },
        { 
          text: 'Hapus', 
          style: 'destructive',
          onPress: async () => {
            await AttendanceStorage.clear();
            setRecords([]);
          }
        }
      ]
    );
  };

  const exportToPDF = async () => {
    const html = `
      <html>
        <head>
          <style>
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid black; padding: 8px; text-align: left; }
            th { background-color: #2563eb; color: white; }
          </style>
        </head>
        <body>
          <h1>Laporan Absensi Siswa</h1>
          <p>Dicetak pada: ${format(new Date(), 'd MMMM yyyy HH:mm', { locale: localeID })}</p>
          <table>
            <thead>
              <tr>
                <th>Nama Siswa</th>
                <th>Kelas</th>
                <th>Status</th>
                <th>Tanggal</th>
                <th>Waktu</th>
              </tr>
            </thead>
            <tbody>
              ${records.map(r => `
                <tr>
                  <td>${r.studentName}</td>
                  <td>${r.className}</td>
                  <td>${r.status}</td>
                  <td>${format(parseISO(r.timestamp), 'd MMM yyyy')}</td>
                  <td>${format(parseISO(r.timestamp), 'HH:mm')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (error) {
      Alert.alert('Error', 'Gagal membuat PDF');
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#2563eb" />
        <Text className="mt-4 text-gray-500 font-medium">Memuat data...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F7F9FC]">
      <ExpoStatusBar style="dark" />
      
      {/* Header */}
      <View className="bg-white border-b border-gray-100 px-6 py-4 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className="w-10 h-10 bg-blue-600 rounded-xl items-center justify-center shadow-lg shadow-blue-200">
            <CheckCircle2 color="white" size={24} />
          </View>
          <View className="ml-3">
            <Text className="text-lg font-bold text-gray-900">SiswaHadir</Text>
            <Text className="text-[10px] text-gray-400 uppercase font-semibold tracking-widest">Presensi Digital</Text>
          </View>
        </View>
        <View>
          <Text className="text-sm font-medium text-gray-600">
            {format(new Date(), 'EEEE, d MMMM', { locale: localeID })}
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-6 pt-6 pb-32">
        {activeTab === 'input' && (
          <View className="space-y-6">
            <View className="mb-4">
              <Text className="text-2xl font-bold text-gray-900">Input Absensi</Text>
              <Text className="text-sm text-gray-500">Pilih kelas dan tandai kehadiran siswa.</Text>
            </View>

            {/* Class Selector */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-6">
              {classes.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setSelectedClass(c)}
                  className={cn(
                    "px-6 py-2.5 rounded-full border mr-2",
                    selectedClass?.id === c.id 
                      ? "bg-blue-600 border-blue-600" 
                      : "bg-white border-gray-100"
                  )}
                >
                  <Text className={cn(
                    "font-bold text-sm",
                    selectedClass?.id === c.id ? "text-white" : "text-gray-500"
                  )}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
              {classes.length === 0 && (
                <Text className="text-sm text-gray-400 py-2">Belum ada kelas. Tambahkan di tab Kelola.</Text>
              )}
            </ScrollView>

            {/* Student List */}
            {selectedClass && (
              <View className="space-y-4">
                <View className="flex-row items-center mb-2">
                  <Users size={14} color="#9CA3AF" />
                  <Text className="ml-2 text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Daftar Siswa {selectedClass.name}
                  </Text>
                </View>
                
                {selectedClass.students.length === 0 ? (
                  <View className="bg-white p-8 rounded-2xl border border-dashed border-gray-200 items-center">
                    <Text className="text-sm text-gray-400">Belum ada siswa di kelas ini.</Text>
                  </View>
                ) : (
                  selectedClass.students.map((student) => {
                    const existingRecord = todayRecords.find(r => r.studentName === student.name && r.className === selectedClass.name);
                    const isEditing = editingStudentId === student.id;

                    return (
                      <View 
                        key={student.id}
                        className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm mb-3"
                      >
                        <View className="flex-row items-center justify-between mb-4">
                          <View className="flex-row items-center">
                            <View className="w-10 h-10 bg-gray-50 rounded-xl items-center justify-center">
                              <User size={20} color="#9CA3AF" />
                            </View>
                            <Text className="ml-3 font-bold text-gray-800">{student.name}</Text>
                          </View>
                          {existingRecord && !isEditing && (
                            <TouchableOpacity 
                              onPress={() => setEditingStudentId(student.id)}
                              className="flex-row items-center bg-blue-50 px-3 py-1.5 rounded-lg"
                            >
                              <Edit2 size={12} color="#2563eb" />
                              <Text className="ml-1 text-blue-600 text-xs font-bold">Edit</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        
                        {existingRecord && !isEditing ? (
                          <View className="flex-row items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-100">
                            <View className="flex-row items-center">
                              <CheckCircle2 size={16} color="#22C55E" />
                              <Text className="ml-2 text-sm font-medium text-gray-600">Sudah Absen</Text>
                            </View>
                            <View className={cn(
                              "px-3 py-1 rounded-full",
                              existingRecord.status === 'Hadir' ? "bg-green-100" : 
                              existingRecord.status === 'Sakit' ? "bg-orange-100" :
                              existingRecord.status === 'Izin' ? "bg-blue-100" : "bg-red-100"
                            )}>
                              <Text className={cn(
                                "text-[10px] font-bold uppercase tracking-wider",
                                existingRecord.status === 'Hadir' ? "text-green-700" : 
                                existingRecord.status === 'Sakit' ? "text-orange-700" :
                                existingRecord.status === 'Izin' ? "text-blue-700" : "text-red-700"
                              )}>
                                {existingRecord.status}
                              </Text>
                            </View>
                          </View>
                        ) : (
                          <View className="flex-row justify-between">
                            {(['Hadir', 'Sakit', 'Izin', 'Alpa'] as AttendanceStatus[]).map((s) => (
                              <TouchableOpacity
                                key={s}
                                onPress={() => handleAttendanceAction(student, s)}
                                className={cn(
                                  "flex-1 py-2 rounded-xl border mx-1 items-center",
                                  s === 'Hadir' ? "border-green-100" : 
                                  s === 'Sakit' ? "border-orange-100" :
                                  s === 'Izin' ? "border-blue-100" : "border-red-100"
                                )}
                              >
                                <Text className={cn(
                                  "text-[10px] font-bold uppercase tracking-wider",
                                  s === 'Hadir' ? "text-green-600" : 
                                  s === 'Sakit' ? "text-orange-600" :
                                  s === 'Izin' ? "text-blue-600" : "text-red-600"
                                )}>
                                  {s}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </View>
        )}

        {activeTab === 'history' && (
          <View className="space-y-6">
            <View className="flex-row items-center justify-between mb-4">
              <View>
                <Text className="text-2xl font-bold text-gray-900">Riwayat</Text>
                <Text className="text-sm text-gray-500">Pilih tanggal untuk melihat data.</Text>
              </View>
              {records.length > 0 && (
                <TouchableOpacity 
                  onPress={clearHistory}
                  className="p-2 bg-red-50 rounded-xl"
                >
                  <Trash2 size={20} color="#EF4444" />
                </TouchableOpacity>
              )}
            </View>

            {/* Calendar Strip */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row mb-6">
              {calendarDays.map((date) => {
                const dateKey = format(date, 'yyyy-MM-dd');
                const isSelected = selectedHistoryDate === dateKey;
                const hasData = !!groupedRecordsByDate[dateKey];

                return (
                  <TouchableOpacity
                    key={dateKey}
                    onPress={() => setSelectedHistoryDate(dateKey)}
                    className={cn(
                      "flex flex-col items-center min-w-[64px] p-3 rounded-[24px] border mr-3",
                      isSelected 
                        ? "bg-blue-600 border-blue-600" 
                        : "bg-white border-gray-100"
                    )}
                  >
                    <Text className={cn(
                      "text-[10px] font-bold uppercase tracking-wider mb-1",
                      isSelected ? "text-white" : "text-gray-500"
                    )}>
                      {format(date, 'EEE', { locale: localeID })}
                    </Text>
                    <Text className={cn(
                      "text-lg font-black",
                      isSelected ? "text-white" : "text-gray-500"
                    )}>
                      {format(date, 'd')}
                    </Text>
                    {hasData && !isSelected && (
                      <View className="w-1 h-1 bg-blue-400 rounded-full mt-1" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Export Buttons */}
            {records.length > 0 && (
              <View className="flex-row gap-3 mb-6">
                <TouchableOpacity
                  onPress={exportToPDF}
                  className="flex-1 flex-row items-center justify-center gap-2 py-3 bg-red-50 rounded-2xl border border-red-100"
                >
                  <FileText size={16} color="#B91C1C" />
                  <Text className="text-red-700 font-bold text-sm">Export PDF</Text>
                </TouchableOpacity>
              </View>
            )}

            <View className="space-y-4">
              {!groupedRecordsByDate[selectedHistoryDate] ? (
                <View className="py-20 items-center justify-center">
                  <View className="w-16 h-16 bg-gray-100 rounded-full items-center justify-center mb-4">
                    <Calendar size={32} color="#D1D5DB" />
                  </View>
                  <Text className="text-gray-400 font-medium">Tidak ada data absensi</Text>
                  <Text className="text-xs text-gray-300">untuk tanggal {format(parseISO(selectedHistoryDate), 'd MMMM yyyy', { locale: localeID })}</Text>
                </View>
              ) : (
                Object.entries(groupedRecordsByDate[selectedHistoryDate]).map(([className, classRecordsData]) => {
                  const classRecords = classRecordsData as AttendanceRecord[];
                  const isClassExpanded = expandedClass === `${selectedHistoryDate}-${className}`;
                  
                  return (
                    <View key={className} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden mb-4">
                      <TouchableOpacity
                        onPress={() => setExpandedClass(isClassExpanded ? null : `${selectedHistoryDate}-${className}`)}
                        className="p-5 flex-row items-center justify-between"
                      >
                        <View className="flex-row items-center">
                          <View className="w-12 h-12 bg-blue-50 rounded-2xl items-center justify-center">
                            <Users size={24} color="#2563eb" />
                          </View>
                          <View className="ml-4">
                            <Text className="font-bold text-gray-900">{className}</Text>
                            <Text className="text-xs text-gray-400 font-medium">
                              {classRecords.length} Siswa Terdata
                            </Text>
                          </View>
                        </View>
                        {isClassExpanded ? <ChevronUp size={20} color="#D1D5DB" /> : <ChevronDown size={20} color="#D1D5DB" />}
                      </TouchableOpacity>

                      {isClassExpanded && (
                        <View className="border-t border-gray-50 bg-gray-50/30 p-4">
                          {classRecords.map((record) => (
                            <View 
                              key={record.id}
                              className="flex-row items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 shadow-sm mb-2"
                            >
                              <View className="flex-row items-center">
                                <View className="w-10 h-10 bg-gray-50 rounded-xl items-center justify-center">
                                  <User size={20} color="#9CA3AF" />
                                </View>
                                <View className="ml-3">
                                  <Text className="text-sm font-bold text-gray-800">{record.studentName}</Text>
                                  <View className="flex-row items-center">
                                    <Clock size={12} color="#9CA3AF" />
                                    <Text className="ml-1 text-[10px] text-gray-400 font-medium">
                                      {format(parseISO(record.timestamp), 'HH:mm')}
                                    </Text>
                                  </View>
                                </View>
                              </View>
                              <View className={cn(
                                "px-3 py-1 rounded-full",
                                record.status === 'Hadir' ? "bg-green-100" : 
                                record.status === 'Sakit' ? "bg-orange-100" :
                                record.status === 'Izin' ? "bg-blue-100" : "bg-red-100"
                              )}>
                                <Text className={cn(
                                  "text-[10px] font-bold uppercase tracking-wider",
                                  record.status === 'Hadir' ? "text-green-700" : 
                                  record.status === 'Sakit' ? "text-orange-700" :
                                  record.status === 'Izin' ? "text-blue-700" : "text-red-700"
                                )}>
                                  {record.status}
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          </View>
        )}

        {activeTab === 'manage' && (
          <View className="space-y-6">
            <View className="flex-row items-center justify-between mb-4">
              <View>
                <Text className="text-2xl font-bold text-gray-900">Kelola Data</Text>
                <Text className="text-sm text-gray-500">Atur daftar kelas dan siswa Anda.</Text>
              </View>
              <TouchableOpacity 
                onPress={resetToDefault}
                className="p-2"
              >
                <RefreshCw size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            {/* Add Class Form */}
            {!isAddingClass ? (
              <TouchableOpacity 
                onPress={() => setIsAddingClass(true)}
                className="w-full py-4 border-2 border-dashed border-gray-200 rounded-2xl items-center justify-center flex-row"
              >
                <PlusCircle size={20} color="#9CA3AF" />
                <Text className="ml-2 text-gray-400 font-bold">Tambah Kelas Baru</Text>
              </TouchableOpacity>
            ) : (
              <View className="bg-white p-4 rounded-2xl border border-blue-100 shadow-lg shadow-blue-50 space-y-3">
                <TextInput 
                  value={newClassName}
                  onChangeText={setNewClassName}
                  placeholder="Nama Kelas (contoh: 10 IPA 1)"
                  className="w-full p-3 bg-gray-50 rounded-xl border border-gray-100 font-medium"
                  autoFocus
                />
                <View className="flex-row gap-2">
                  <TouchableOpacity 
                    onPress={handleAddClass}
                    className="flex-1 py-3 bg-blue-600 rounded-xl items-center"
                  >
                    <Text className="text-white font-bold text-sm">Simpan</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => setIsAddingClass(false)}
                    className="px-4 py-3 bg-gray-100 rounded-xl items-center"
                  >
                    <Text className="text-gray-500 font-bold text-sm">Batal</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Classes List */}
            <View className="space-y-4">
              {classes.map((c) => (
                <View key={c.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden mb-4">
                  <View className="p-5 flex-row items-center justify-between border-b border-gray-50">
                    <View className="flex-row items-center">
                      <View className="w-10 h-10 bg-blue-50 rounded-xl items-center justify-center">
                        <Users size={20} color="#2563eb" />
                      </View>
                      <Text className="ml-3 font-bold text-gray-800">{c.name}</Text>
                    </View>
                    <TouchableOpacity 
                      onPress={() => handleDeleteClass(c.id)}
                      className="p-2"
                    >
                      <Trash2 size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>

                  <View className="p-5 space-y-4">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                        Daftar Siswa ({c.students.length})
                      </Text>
                      <TouchableOpacity 
                        onPress={() => setShowBulkInput(showBulkInput === c.id ? null : c.id)}
                      >
                        <Text className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                          {showBulkInput === c.id ? 'Tutup Impor' : 'Impor Massal'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {showBulkInput === c.id && (
                      <View className="bg-blue-50 p-3 rounded-2xl border border-blue-100 space-y-2">
                        <Text className="text-[10px] text-blue-600 font-medium">Masukkan nama siswa (pisahkan dengan koma atau baris baru):</Text>
                        <TextInput 
                          value={bulkStudentNames}
                          onChangeText={setBulkStudentNames}
                          multiline
                          numberOfLines={4}
                          className="w-full p-3 text-sm bg-white rounded-xl border border-blue-100 min-h-[100px]"
                          placeholder="Contoh:&#10;Andi Saputra&#10;Beni Irawan&#10;Cici Amalia"
                        />
                        <TouchableOpacity 
                          onPress={() => handleBulkAddStudents(c.id)}
                          className="w-full py-2 bg-blue-600 rounded-xl flex-row items-center justify-center"
                        >
                          <Upload size={14} color="white" />
                          <Text className="ml-2 text-white font-bold text-xs">Impor Sekarang</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    <View className="max-h-[200px]">
                      {c.students.length === 0 ? (
                        <Text className="text-xs text-gray-400 text-center py-4">Belum ada siswa.</Text>
                      ) : (
                        c.students.map((s) => (
                          <View key={s.id} className="flex-row items-center justify-between p-3 bg-gray-50 rounded-xl mb-2">
                            <Text className="text-sm font-medium text-gray-700">{s.name}</Text>
                            <TouchableOpacity 
                              onPress={() => handleDeleteStudent(c.id, s.id)}
                            >
                              <X size={16} color="#D1D5DB" />
                            </TouchableOpacity>
                          </View>
                        ))
                      )}
                    </View>

                    {/* Add Student Form */}
                    <View className="flex-row gap-2">
                      <TextInput 
                        value={editingClassId === c.id ? newStudentName : ''}
                        onChangeText={(text) => {
                          setEditingClassId(c.id);
                          setNewStudentName(text);
                        }}
                        onFocus={() => setEditingClassId(c.id)}
                        placeholder="Nama Siswa Baru..."
                        className="flex-1 p-2.5 bg-gray-50 rounded-xl border border-gray-100 text-sm"
                      />
                      <TouchableOpacity 
                        onPress={() => handleAddStudent(c.id)}
                        className="p-2.5 bg-blue-600 rounded-xl"
                      >
                        <Plus size={20} color="white" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Navigation Bar */}
      <View className="absolute bottom-6 left-6 right-6 bg-white/90 border border-gray-100 rounded-3xl shadow-2xl p-2 flex-row items-center gap-2">
        <TouchableOpacity
          onPress={() => setActiveTab('input')}
          className={cn(
            "flex-1 flex-row items-center justify-center gap-2 py-3 rounded-2xl",
            activeTab === 'input' ? "bg-blue-600 shadow-lg shadow-blue-200" : ""
          )}
        >
          <Users size={18} color={activeTab === 'input' ? "white" : "#9CA3AF"} />
          <Text className={cn(
            "font-bold text-[10px] uppercase tracking-wider",
            activeTab === 'input' ? "text-white" : "text-gray-400"
          )}>
            Input
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('history')}
          className={cn(
            "flex-1 flex-row items-center justify-center gap-2 py-3 rounded-2xl",
            activeTab === 'history' ? "bg-blue-600 shadow-lg shadow-blue-200" : ""
          )}
        >
          <History size={18} color={activeTab === 'history' ? "white" : "#9CA3AF"} />
          <Text className={cn(
            "font-bold text-[10px] uppercase tracking-wider",
            activeTab === 'history' ? "text-white" : "text-gray-400"
          )}>
            Riwayat
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('manage')}
          className={cn(
            "flex-1 flex-row items-center justify-center gap-2 py-3 rounded-2xl",
            activeTab === 'manage' ? "bg-blue-600 shadow-lg shadow-blue-200" : ""
          )}
        >
          <Settings size={18} color={activeTab === 'manage' ? "white" : "#9CA3AF"} />
          <Text className={cn(
            "font-bold text-[10px] uppercase tracking-wider",
            activeTab === 'manage' ? "text-white" : "text-gray-400"
          )}>
            Kelola
          </Text>
        </TouchableOpacity>
      </View>

      {/* Proof Upload Modal */}
      <Modal
        visible={!!pendingRecord}
        transparent
        animationType="slide"
        onRequestClose={() => setPendingRecord(null)}
      >
        <View className="flex-1 justify-end bg-black/60">
          <TouchableOpacity 
            className="absolute inset-0" 
            onPress={() => setPendingRecord(null)} 
          />
          <View className="bg-white rounded-t-[32px] p-6 space-y-6">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-xl font-bold text-gray-900">Upload Bukti {pendingRecord?.status}</Text>
                <Text className="text-sm text-gray-500">{pendingRecord?.student.name}</Text>
              </View>
              <TouchableOpacity 
                onPress={() => setPendingRecord(null)}
                className="p-2 bg-gray-100 rounded-full"
              >
                <X size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View className="items-center justify-center py-10 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
              <Camera size={40} color="#D1D5DB" />
              <Text className="mt-2 text-sm text-gray-400 font-medium">Fitur Kamera Segera Hadir</Text>
              <Text className="text-[10px] text-gray-300">Gunakan versi Web untuk upload foto</Text>
            </View>

            <TouchableOpacity
              onPress={handleModalSubmit}
              className="w-full py-4 bg-blue-600 rounded-2xl items-center shadow-xl shadow-blue-200"
            >
              <Text className="text-white font-bold">Simpan Absensi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Success Toast */}
      {showSuccess && (
        <View className="absolute bottom-24 left-6 right-6 bg-green-600 px-6 py-3 rounded-2xl shadow-2xl flex-row items-center justify-center gap-3">
          <CheckCircle2 size={20} color="white" />
          <Text className="text-white font-bold">Absensi Berhasil!</Text>
        </View>
      )}
    </SafeAreaView>
  );
}
