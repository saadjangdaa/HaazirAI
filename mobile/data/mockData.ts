import { UserBooking, WorkerEarningsSummary } from '../services/api';

// ─── Customer Mock Data ────────────────────────────────────────────────────────

export const MOCK_CUSTOMER_NAME = 'Ahmed Ali';

export const MOCK_CUSTOMER_BOOKINGS: UserBooking[] = [
  {
    booking_id: 'HAZ-MOCK-001',
    user_id: 'mock-user',
    service: 'AC Repair',
    provider_id: 'p001',
    provider_name: 'Muhammad Tariq',
    scheduled_time: '15 May, Subah 10 baj ke',
    status: 'completed',
    price: 2500,
    created_at: '2025-05-15T05:00:00Z',
    tracking_steps: [
      { step: 'Booking Confirmed', done: true, key: 'confirmed' },
      { step: 'Provider On the Way', done: true, key: 'on_the_way' },
      { step: 'Arrived', done: true, key: 'arrived' },
      { step: 'Work in Progress', done: true, key: 'in_progress' },
      { step: 'Completed', done: true, key: 'completed' },
    ],
  },
  {
    booking_id: 'HAZ-MOCK-002',
    user_id: 'mock-user',
    service: 'Plumber',
    provider_id: 'p005',
    provider_name: 'Aslam Khan',
    scheduled_time: '18 May, Dopahar 2 baje',
    status: 'completed',
    price: 800,
    created_at: '2025-05-18T09:00:00Z',
    tracking_steps: [
      { step: 'Booking Confirmed', done: true, key: 'confirmed' },
      { step: 'Provider On the Way', done: true, key: 'on_the_way' },
      { step: 'Arrived', done: true, key: 'arrived' },
      { step: 'Work in Progress', done: true, key: 'in_progress' },
      { step: 'Completed', done: true, key: 'completed' },
    ],
  },
  {
    booking_id: 'HAZ-MOCK-003',
    user_id: 'mock-user',
    service: 'Electrician',
    provider_id: 'p010',
    provider_name: 'Rashid Hussain',
    scheduled_time: 'Aaj, Sham 5 baje',
    status: 'in_progress',
    price: 1200,
    created_at: '2025-05-20T07:00:00Z',
    tracking_steps: [
      { step: 'Booking Confirmed', done: true, key: 'confirmed' },
      { step: 'Provider On the Way', done: true, key: 'on_the_way' },
      { step: 'Arrived', done: true, key: 'arrived' },
      { step: 'Work in Progress', done: true, key: 'in_progress' },
      { step: 'Completed', done: false, key: 'completed' },
    ],
  },
  {
    booking_id: 'HAZ-MOCK-004',
    user_id: 'mock-user',
    service: 'Math Tutor',
    provider_id: 'p020',
    provider_name: 'Farhan Ahmed',
    scheduled_time: 'Kal, Subah 9 baje',
    status: 'assigned',
    price: 1500,
    created_at: '2025-05-20T10:00:00Z',
    tracking_steps: [
      { step: 'Booking Confirmed', done: true, key: 'confirmed' },
      { step: 'Provider On the Way', done: false, key: 'on_the_way' },
      { step: 'Arrived', done: false, key: 'arrived' },
      { step: 'Work in Progress', done: false, key: 'in_progress' },
      { step: 'Completed', done: false, key: 'completed' },
    ],
  },
];

export const MOCK_RECENT_REQUESTS = [
  'AC gas refill G-13 kal subah',
  'Electrician DHA bijli fault urgent',
  'Math tutor bachon ke liye weekend',
];

export const MOCK_CUSTOMER_STATS = {
  totalBookings: MOCK_CUSTOMER_BOOKINGS.length,
  totalSpent: MOCK_CUSTOMER_BOOKINGS.reduce((s, b) => s + (b.price || 0), 0),
  saved: 350,
};

// ─── Worker Mock Data ──────────────────────────────────────────────────────────

export const MOCK_WORKER_NAME = 'Mohammad Rashid';

export const MOCK_WORKER_BOOKINGS: UserBooking[] = [
  {
    booking_id: 'HAZ-WRK-001',
    user_id: 'mock-customer-1',
    service: 'AC Repair',
    provider_id: 'mock-worker',
    provider_name: 'Mohammad Rashid',
    scheduled_time: 'Aaj, Subah 10 baje',
    status: 'on_the_way',
    price: 2500,
    created_at: '2025-05-20T04:00:00Z',
    tracking_steps: [
      { step: 'Confirmed', done: true, key: 'confirmed' },
      { step: 'On the Way', done: true, key: 'on_the_way' },
      { step: 'Arrived', done: false, key: 'arrived' },
      { step: 'In Progress', done: false, key: 'in_progress' },
      { step: 'Completed', done: false, key: 'completed' },
    ],
  },
  {
    booking_id: 'HAZ-WRK-002',
    user_id: 'mock-customer-2',
    service: 'Electrician',
    provider_id: 'mock-worker',
    provider_name: 'Mohammad Rashid',
    scheduled_time: 'Aaj, Dopahar 2 baje',
    status: 'confirmed',
    price: 1800,
    created_at: '2025-05-20T05:00:00Z',
    tracking_steps: [
      { step: 'Confirmed', done: true, key: 'confirmed' },
      { step: 'On the Way', done: false, key: 'on_the_way' },
      { step: 'Arrived', done: false, key: 'arrived' },
      { step: 'In Progress', done: false, key: 'in_progress' },
      { step: 'Completed', done: false, key: 'completed' },
    ],
  },
  {
    booking_id: 'HAZ-WRK-003',
    user_id: 'mock-customer-3',
    service: 'Plumber',
    provider_id: 'mock-worker',
    provider_name: 'Mohammad Rashid',
    scheduled_time: 'Kal, Subah 9 baje',
    status: 'assigned',
    price: 900,
    created_at: '2025-05-20T06:00:00Z',
    tracking_steps: [
      { step: 'Confirmed', done: false, key: 'confirmed' },
      { step: 'On the Way', done: false, key: 'on_the_way' },
      { step: 'Arrived', done: false, key: 'arrived' },
      { step: 'In Progress', done: false, key: 'in_progress' },
      { step: 'Completed', done: false, key: 'completed' },
    ],
  },
  {
    booking_id: 'HAZ-WRK-H01',
    user_id: 'mock-customer-4',
    service: 'Carpenter',
    provider_id: 'mock-worker',
    provider_name: 'Mohammad Rashid',
    scheduled_time: '17 May, Dopahar 2 baje',
    status: 'completed',
    price: 1500,
    created_at: '2025-05-17T09:00:00Z',
  },
  {
    booking_id: 'HAZ-WRK-H02',
    user_id: 'mock-customer-5',
    service: 'AC Repair',
    provider_id: 'mock-worker',
    provider_name: 'Mohammad Rashid',
    scheduled_time: '15 May, Subah 10 baje',
    status: 'completed',
    price: 2800,
    created_at: '2025-05-15T05:00:00Z',
  },
];

export const MOCK_WORKER_EARNINGS: WorkerEarningsSummary = {
  today_total: 4300,
  today_jobs: 2,
  week_total: 28500,
  week_jobs: 12,
  week_by_day: [3200, 4100, 5800, 3900, 4300, 4700, 2500],
  completed_count: 47,
  recent_payments: [
    { booking_id: 'HAZ-WRK-001', label: 'AC Repair — Sara Ahmed', amount: 2500, received: true },
    { booking_id: 'HAZ-WRK-P02', label: 'Electrician — Bilal Malik', amount: 1800, received: true },
    { booking_id: 'HAZ-WRK-P03', label: 'Plumber — Ayesha Khan', amount: 900, received: false },
  ],
};
