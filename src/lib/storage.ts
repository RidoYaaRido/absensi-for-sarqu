import { AttendanceRecord, ClassData } from '../types';

const STORAGE_KEY = 'siswa_hadir_attendance_v1';
const CLASSES_KEY = 'siswa_hadir_classes_v1';

const DEFAULT_CLASSES: ClassData[] = [
  {
    id: 'c1',
    name: 'X MIPA 1',
    students: [
      { id: 's1', name: 'Aditya Pratama' },
      { id: 's2', name: 'Anisa Rahmawati' },
      { id: 's3', name: 'Bagus Setiawan' },
      { id: 's4', name: 'Citra Dewi' },
      { id: 's5', name: 'Dimas Saputra' },
    ]
  },
  {
    id: 'c2',
    name: 'X MIPA 2',
    students: [
      { id: 's6', name: 'Eka Kurniawan' },
      { id: 's7', name: 'Fitri Handayani' },
      { id: 's8', name: 'Gilang Ramadhan' },
      { id: 's9', name: 'Hana Pertiwi' },
      { id: 's10', name: 'Indra Wijaya' },
    ]
  }
];

export const AttendanceStorage = {
  // Attendance Records
  save: (record: AttendanceRecord) => {
    const records = AttendanceStorage.getAll();
    const existingIndex = records.findIndex(r => 
      r.studentName === record.studentName && 
      r.className === record.className &&
      new Date(r.timestamp).toDateString() === new Date(record.timestamp).toDateString()
    );

    if (existingIndex !== -1) {
      records[existingIndex] = record;
    } else {
      records.unshift(record); // Newest first
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  },

  getAll: (): AttendanceRecord[] => {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to parse attendance data', e);
      return [];
    }
  },

  clear: () => {
    localStorage.removeItem(STORAGE_KEY);
  },

  // Classes and Students
  getClasses: (): ClassData[] => {
    const data = localStorage.getItem(CLASSES_KEY);
    if (!data) return DEFAULT_CLASSES;
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to parse classes data', e);
      return DEFAULT_CLASSES;
    }
  },

  saveClasses: (classes: ClassData[]) => {
    localStorage.setItem(CLASSES_KEY, JSON.stringify(classes));
  }
};
