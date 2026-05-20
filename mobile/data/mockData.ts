import { UserBooking, WorkerEarningsSummary, Bid } from '../services/api';
import { BookingResult } from '../services/conversationApi';

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
    tracking_steps: [],
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
    tracking_steps: [],
  },
];

export interface MockDispute {
  id: string;
  bookingId: string;
  service: string;
  providerName: string;
  type: string;
  typeLabel: string;
  description: string;
  status: 'open' | 'under_review' | 'resolved' | 'escalated' | 'closed';
  createdAt: string;
  resolution?: string;
  refundAmount?: number;
}

export const MOCK_DISPUTES: MockDispute[] = [
  {
    id: 'DSP-MOCK-9F3A',
    bookingId: 'HAZ-MOCK-003',
    service: 'Electrician',
    providerName: 'Rashid Hussain',
    type: 'quality',
    typeLabel: 'Quality Complaint',
    description: 'Electrician ne kaam adhoora chor diya — wire connection nahi ki aur chale gaye.',
    status: 'resolved',
    createdAt: '2025-05-20T08:00:00Z',
    resolution:
      'JHAGRA agent ne faisle kiya: Provider Rashid Hussain 2 din mein wapas aega service dobara karne ke liye — bilkul free. Provider ki profile pe warning flag lag gaya.',
  },
  {
    id: 'DSP-MOCK-B22C',
    bookingId: 'HAZ-MOCK-002',
    service: 'Plumber',
    providerName: 'Aslam Khan',
    type: 'price',
    typeLabel: 'Price Disagreement',
    description: 'Provider ne pehle Rs 800 mein karna kaha tha lekin baad mein 1200 maang raha hai.',
    status: 'open',
    createdAt: '2025-05-19T11:00:00Z',
  },
];

export interface NearbyWorker {
  id: string;
  name: string;
  service: string;
  rating: number;
  reviews: number;
  priceMin: number;
  priceMax: number;
  distanceKm: number;
  available: boolean;
  verified: boolean;
  completedJobs: number;
  area: string;
  lat: number;
  lng: number;
}

export const MOCK_NEARBY_WORKERS: NearbyWorker[] = [
  { id: 'w1',  name: 'Muhammad Tariq', service: 'AC Repair',    rating: 4.9, reviews: 132, priceMin: 1500, priceMax: 3500, distanceKm: 0.8, available: true,  verified: true,  completedJobs: 247, area: 'Gulshan-e-Iqbal', lat: 24.8967, lng: 67.1058 },
  { id: 'w2',  name: 'Aslam Khan',     service: 'Plumber',      rating: 4.7, reviews: 89,  priceMin: 600,  priceMax: 1500, distanceKm: 1.2, available: true,  verified: true,  completedJobs: 183, area: 'North Nazimabad', lat: 24.8817, lng: 67.0858 },
  { id: 'w3',  name: 'Rashid Hussain', service: 'Electrician',  rating: 4.8, reviews: 211, priceMin: 800,  priceMax: 2500, distanceKm: 1.5, available: true,  verified: true,  completedJobs: 312, area: 'DHA Phase 2',     lat: 24.8793, lng: 67.1108 },
  { id: 'w4',  name: 'Farhan Ahmed',   service: 'Tutor',        rating: 4.6, reviews: 54,  priceMin: 500,  priceMax: 1200, distanceKm: 2.1, available: false, verified: true,  completedJobs: 98,  area: 'Clifton',         lat: 24.9087, lng: 67.0748 },
  { id: 'w5',  name: 'Zubair Malik',   service: 'Carpenter',    rating: 4.5, reviews: 67,  priceMin: 1000, priceMax: 4000, distanceKm: 2.4, available: true,  verified: false, completedJobs: 74,  area: 'Gulshan-e-Iqbal', lat: 24.9037, lng: 67.1188 },
  { id: 'w6',  name: 'Imran Baig',     service: 'Electrician',  rating: 4.4, reviews: 43,  priceMin: 700,  priceMax: 2000, distanceKm: 3.0, available: true,  verified: true,  completedJobs: 56,  area: 'Nazimabad',       lat: 24.8697, lng: 67.0728 },
  { id: 'w7',  name: 'Khalid Rehman',  service: 'AC Repair',    rating: 4.7, reviews: 98,  priceMin: 1200, priceMax: 3000, distanceKm: 3.3, available: true,  verified: true,  completedJobs: 189, area: 'PECHS',           lat: 24.8647, lng: 67.1208 },
  { id: 'w8',  name: 'Sajid Mehmood',  service: 'Plumber',      rating: 4.3, reviews: 31,  priceMin: 500,  priceMax: 1200, distanceKm: 4.1, available: false, verified: false, completedJobs: 42,  area: 'Malir',           lat: 24.9237, lng: 67.1308 },
  { id: 'w9',  name: 'Bilal Hassan',   service: 'Beautician',   rating: 4.9, reviews: 77,  priceMin: 1500, priceMax: 5000, distanceKm: 1.8, available: true,  verified: true,  completedJobs: 134, area: 'Defence',         lat: 24.8737, lng: 67.0838 },
  { id: 'w10', name: 'Naeem Siddiqui', service: 'Carpenter',    rating: 4.6, reviews: 52,  priceMin: 900,  priceMax: 3500, distanceKm: 2.7, available: true,  verified: true,  completedJobs: 88,  area: 'Gulberg',         lat: 24.9117, lng: 67.0688 },
];

// ─── Bidding / Booking Mock Data (for Demo Mode in voice conversation) ────────

export const MOCK_BIDS: Bid[] = [
  {
    provider_id: 'mock-w1',
    provider_name: 'Muhammad Tariq',
    bid_price: 2800,
    final_price: 2350,
    eta_minutes: 18,
    rating: 4.9,
    message: 'Main 18 minute mein pahunch jaunga, quality kaam guarantee!',
    negotiated: true,
  },
  {
    provider_id: 'mock-w2',
    provider_name: 'Aslam Khan',
    bid_price: 2500,
    final_price: 2100,
    eta_minutes: 25,
    rating: 4.7,
    message: 'Acha kaam karta hun, customer satisfied hoga insha Allah!',
    negotiated: true,
  },
  {
    provider_id: 'mock-w3',
    provider_name: 'Rashid Hussain',
    bid_price: 3000,
    final_price: 2600,
    eta_minutes: 30,
    rating: 4.8,
    message: '10 saal ka tajurba, kal tak free guarantee.',
    negotiated: false,
  },
];

export function makeMockBookingResult(
  providerName = 'Muhammad Tariq',
  price = 2350,
  service = 'Service',
): BookingResult {
  return {
    booking_id: 'HAZ-DEMO-A1B2C3',
    provider: {
      id: 'mock-w1',
      name: providerName,
      service,
      phone: '03001234567',
      rating: 4.9,
    },
    receipt: {
      service,
      scheduled_time: 'Kal, Subah 10 baje',
      estimated_price: `Rs. ${price.toLocaleString()}`,
      payment_methods: ['cash'],
      status: 'confirmed',
    },
    confirmation_message: `✅ Demo booking confirm! ${providerName} kal aayenge. ID: HAZ-DEMO-A1B2C3`,
    reminders: ['Subah 8 baje reminder bheja jayega'],
    payment_method: 'cash',
    whatsapp_sent: false,
  };
}

// ─── Worker Earnings ────────────────────────────────────────────────────────

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
