/**
 * Seed reference data for the demo organisation.
 *
 * This file is DATA ONLY. The hierarchy below is written into the database by
 * `seed.ts`; nothing in the application reads it at runtime, so administrators
 * can reshape departments, positions and reporting lines from the admin panel
 * without touching code.
 */

export interface DepartmentSeed {
  code: string;
  name: string;
  description: string;
  color: string;
  sortOrder: number;
}

export const DEPARTMENTS: DepartmentSeed[] = [
  {
    code: 'EXEC',
    name: 'Executive',
    description: 'Country leadership and organisation-wide oversight.',
    color: '#4338CA',
    sortOrder: 1,
  },
  {
    code: 'PROG',
    name: 'Programme',
    description: 'Programme delivery, technical advice and project management.',
    color: '#0EA5E9',
    sortOrder: 2,
  },
  {
    code: 'FIN',
    name: 'Finance',
    description: 'Financial management, awards, accounting and compliance.',
    color: '#10B981',
    sortOrder: 3,
  },
  {
    code: 'OPS',
    name: 'Operations',
    description: 'Procurement, logistics and operational support.',
    color: '#F59E0B',
    sortOrder: 4,
  },
  {
    code: 'HR',
    name: 'Human Resources',
    description: 'Recruitment, staff welfare and people operations.',
    color: '#EC4899',
    sortOrder: 5,
  },
  {
    code: 'PQL',
    name: 'Programme Quality & Learning',
    description: 'Monitoring, evaluation, accountability, learning and communications.',
    color: '#8B5CF6',
    sortOrder: 6,
  },
];

export interface PositionSeed {
  code: string;
  title: string;
  departmentCode: string;
  reportsToCode: string | null;
  level: number;
  description: string;
}

/** The organigram supplied by the organisation, expressed as data. */
export const POSITIONS: PositionSeed[] = [
  {
    code: 'CD',
    title: 'Country Director',
    departmentCode: 'EXEC',
    reportsToCode: null,
    level: 100,
    description: 'Provides overall leadership and oversight of the country programme.',
  },

  // --- Human Resources -----------------------------------------------------
  {
    code: 'HR_MGR',
    title: 'HR Manager',
    departmentCode: 'HR',
    reportsToCode: 'CD',
    level: 70,
    description: 'Leads the people function.',
  },
  {
    code: 'HR_OFF',
    title: 'HR Officer',
    departmentCode: 'HR',
    reportsToCode: 'HR_MGR',
    level: 40,
    description: 'Day-to-day HR administration and recruitment support.',
  },

  // --- Programme -----------------------------------------------------------
  {
    code: 'PROG_DIR',
    title: 'Programme Director',
    departmentCode: 'PROG',
    reportsToCode: 'CD',
    level: 80,
    description: 'Oversees programmatic and technical functions.',
  },
  {
    code: 'SERVE_PM',
    title: 'SERVE Project Manager',
    departmentCode: 'PROG',
    reportsToCode: 'PROG_DIR',
    level: 60,
    description: 'Runs delivery of the SERVE project.',
  },
  {
    code: 'GEAR_PM',
    title: 'GEAR Project Manager',
    departmentCode: 'PROG',
    reportsToCode: 'PROG_DIR',
    level: 60,
    description: 'Runs delivery of the GEAR project.',
  },
  {
    code: 'PBW_PM',
    title: 'Powered by Women Project Manager',
    departmentCode: 'PROG',
    reportsToCode: 'PROG_DIR',
    level: 60,
    description: 'Runs delivery of the Powered by Women project.',
  },
  {
    code: 'KUNGAHARA_PM',
    title: 'KUNGAHARA Project Manager',
    departmentCode: 'PROG',
    reportsToCode: 'PROG_DIR',
    level: 60,
    description: 'Runs delivery of the KUNGAHARA project.',
  },
  {
    code: 'SAFEGUARD_ADV',
    title: 'Safeguarding Advisor',
    departmentCode: 'PROG',
    reportsToCode: 'PROG_DIR',
    level: 50,
    description: 'Safeguarding policy, training and case oversight.',
  },
  {
    code: 'SPRING_ADV',
    title: 'SPRING Advisor',
    departmentCode: 'PROG',
    reportsToCode: 'PROG_DIR',
    level: 50,
    description: 'Technical advice for the SPRING portfolio.',
  },
  {
    code: 'GESI_ADV',
    title: 'GESI Advisor',
    departmentCode: 'PROG',
    reportsToCode: 'SERVE_PM',
    level: 45,
    description: 'Gender equality and social inclusion technical review.',
  },
  {
    code: 'VC_ADV',
    title: 'Value Chain Advisor',
    departmentCode: 'PROG',
    reportsToCode: 'SERVE_PM',
    level: 45,
    description: 'Agricultural value chain development.',
  },
  {
    code: 'ENT_ADV',
    title: 'Enterprise Advisor',
    departmentCode: 'PROG',
    reportsToCode: 'SERVE_PM',
    level: 45,
    description: 'Enterprise development and market systems.',
  },
  {
    code: 'GOV_ADV',
    title: 'Governance Advisor',
    departmentCode: 'PROG',
    reportsToCode: 'PBW_PM',
    level: 45,
    description: 'Governance, civic participation and advocacy.',
  },
  {
    code: 'GENDER_SRH_ADV',
    title: 'Gender & SRH Advisor',
    departmentCode: 'PROG',
    reportsToCode: 'PBW_PM',
    level: 45,
    description: 'Gender and sexual and reproductive health technical lead.',
  },

  // --- Operations ----------------------------------------------------------
  {
    code: 'OPS_MGR',
    title: 'Operations Manager',
    departmentCode: 'OPS',
    reportsToCode: 'CD',
    level: 70,
    description: 'Oversees procurement, logistics and operational support.',
  },
  {
    code: 'PROC_SPEC',
    title: 'Procurement Specialist',
    departmentCode: 'OPS',
    reportsToCode: 'OPS_MGR',
    level: 50,
    description: 'Leads sourcing, tender evaluation and supplier management.',
  },
  {
    code: 'PROC_OFF',
    title: 'Procurement Officer',
    departmentCode: 'OPS',
    reportsToCode: 'OPS_MGR',
    level: 40,
    description: 'Processes purchase requests and quotations.',
  },
  {
    code: 'LOG_OFF',
    title: 'Logistics Officer',
    departmentCode: 'OPS',
    reportsToCode: 'OPS_MGR',
    level: 40,
    description: 'Fleet, warehousing and field logistics.',
  },

  // --- Finance -------------------------------------------------------------
  {
    code: 'FIN_MGR',
    title: 'Finance Manager',
    departmentCode: 'FIN',
    reportsToCode: 'CD',
    level: 70,
    description: 'Leads financial management and donor compliance.',
  },
  {
    code: 'FIN_SUP',
    title: 'Finance & Accounting Supervisor',
    departmentCode: 'FIN',
    reportsToCode: 'FIN_MGR',
    level: 50,
    description: 'Supervises accounting operations and month-end close.',
  },
  {
    code: 'FIN_OFF',
    title: 'Finance Officer',
    departmentCode: 'FIN',
    reportsToCode: 'FIN_SUP',
    level: 40,
    description: 'Payments, reconciliations and financial records.',
  },
  {
    code: 'AWARD_OFF_1',
    title: 'Award & Accountant Officer 1',
    departmentCode: 'FIN',
    reportsToCode: 'FIN_MGR',
    level: 40,
    description: 'Award management and donor reporting.',
  },
  {
    code: 'AWARD_OFF_2',
    title: 'Award & Accountant Officer 2',
    departmentCode: 'FIN',
    reportsToCode: 'FIN_MGR',
    level: 40,
    description: 'Award management and donor reporting.',
  },

  // --- Programme Quality & Learning ---------------------------------------
  {
    code: 'PQL_DIR',
    title: 'PQL Director',
    departmentCode: 'PQL',
    reportsToCode: 'CD',
    level: 80,
    description: 'Leads quality, learning and communications functions.',
  },
  {
    code: 'MEAL_1',
    title: 'MEAL Specialist 1',
    departmentCode: 'PQL',
    reportsToCode: 'PQL_DIR',
    level: 45,
    description: 'Monitoring, evaluation, accountability and learning.',
  },
  {
    code: 'MEAL_2',
    title: 'MEAL Specialist 2',
    departmentCode: 'PQL',
    reportsToCode: 'PQL_DIR',
    level: 45,
    description: 'Monitoring, evaluation, accountability and learning.',
  },
  {
    code: 'MEAL_3',
    title: 'MEAL Specialist 3',
    departmentCode: 'PQL',
    reportsToCode: 'PQL_DIR',
    level: 45,
    description: 'Monitoring, evaluation, accountability and learning.',
  },
  {
    code: 'COMMS_SPEC',
    title: 'Communications Specialist',
    departmentCode: 'PQL',
    reportsToCode: 'PQL_DIR',
    level: 45,
    description: 'External communications, media and knowledge products.',
  },
];

export interface UserSeed {
  firstName: string;
  lastName: string;
  email: string;
  positionCode: string;
  roleKey: string;
  phone: string;
}

/**
 * Demo staff - fictional people, development-only credentials.
 * Every account uses the password in SEED_DEFAULT_PASSWORD.
 */
export const USERS: UserSeed[] = [
  { firstName: 'Amara', lastName: 'Kalisa', email: 'country.director@care.demo', positionCode: 'CD', roleKey: 'COUNTRY_DIRECTOR', phone: '+250 788 000 101' },

  { firstName: 'Diane', lastName: 'Uwera', email: 'hr.manager@care.demo', positionCode: 'HR_MGR', roleKey: 'MANAGER', phone: '+250 788 000 102' },
  { firstName: 'Eric', lastName: 'Habimana', email: 'hr.officer@care.demo', positionCode: 'HR_OFF', roleKey: 'STAFF', phone: '+250 788 000 103' },

  { firstName: 'Joseph', lastName: 'Mugisha', email: 'programme.director@care.demo', positionCode: 'PROG_DIR', roleKey: 'DIRECTOR', phone: '+250 788 000 104' },
  { firstName: 'Claudine', lastName: 'Ingabire', email: 'serve.pm@care.demo', positionCode: 'SERVE_PM', roleKey: 'PROJECT_MANAGER', phone: '+250 788 000 105' },
  { firstName: 'Patrick', lastName: 'Nsengimana', email: 'gear.pm@care.demo', positionCode: 'GEAR_PM', roleKey: 'PROJECT_MANAGER', phone: '+250 788 000 106' },
  { firstName: 'Solange', lastName: 'Mukamana', email: 'pbw.pm@care.demo', positionCode: 'PBW_PM', roleKey: 'PROJECT_MANAGER', phone: '+250 788 000 107' },
  { firstName: 'Fidele', lastName: 'Rwema', email: 'kungahara.pm@care.demo', positionCode: 'KUNGAHARA_PM', roleKey: 'PROJECT_MANAGER', phone: '+250 788 000 108' },
  { firstName: 'Grace', lastName: 'Umutoni', email: 'safeguarding.advisor@care.demo', positionCode: 'SAFEGUARD_ADV', roleKey: 'SUPERVISOR', phone: '+250 788 000 109' },
  { firstName: 'Emmanuel', lastName: 'Bizimana', email: 'spring.advisor@care.demo', positionCode: 'SPRING_ADV', roleKey: 'SUPERVISOR', phone: '+250 788 000 110' },
  { firstName: 'Aline', lastName: 'Mukandayisenga', email: 'gesi.advisor@care.demo', positionCode: 'GESI_ADV', roleKey: 'SUPERVISOR', phone: '+250 788 000 111' },
  { firstName: 'Jean', lastName: 'Baptiste', email: 'valuechain.advisor@care.demo', positionCode: 'VC_ADV', roleKey: 'SUPERVISOR', phone: '+250 788 000 112' },
  { firstName: 'Yvonne', lastName: 'Nyirahabimana', email: 'enterprise.advisor@care.demo', positionCode: 'ENT_ADV', roleKey: 'SUPERVISOR', phone: '+250 788 000 113' },
  { firstName: 'Olivier', lastName: 'Karangwa', email: 'governance.advisor@care.demo', positionCode: 'GOV_ADV', roleKey: 'SUPERVISOR', phone: '+250 788 000 114' },
  { firstName: 'Josiane', lastName: 'Uwimana', email: 'gender.srh.advisor@care.demo', positionCode: 'GENDER_SRH_ADV', roleKey: 'SUPERVISOR', phone: '+250 788 000 115' },

  { firstName: 'Samuel', lastName: 'Niyonzima', email: 'operations.manager@care.demo', positionCode: 'OPS_MGR', roleKey: 'MANAGER', phone: '+250 788 000 116' },
  { firstName: 'Christine', lastName: 'Mutesi', email: 'procurement.specialist@care.demo', positionCode: 'PROC_SPEC', roleKey: 'SUPERVISOR', phone: '+250 788 000 117' },
  { firstName: 'Daniel', lastName: 'Twagirayezu', email: 'procurement.officer@care.demo', positionCode: 'PROC_OFF', roleKey: 'STAFF', phone: '+250 788 000 118' },
  { firstName: 'Alphonse', lastName: 'Munyaneza', email: 'logistics.officer@care.demo', positionCode: 'LOG_OFF', roleKey: 'STAFF', phone: '+250 788 000 119' },

  { firstName: 'Beatrice', lastName: 'Kamikazi', email: 'finance.manager@care.demo', positionCode: 'FIN_MGR', roleKey: 'MANAGER', phone: '+250 788 000 120' },
  { firstName: 'Theogene', lastName: 'Ndayisaba', email: 'finance.supervisor@care.demo', positionCode: 'FIN_SUP', roleKey: 'SUPERVISOR', phone: '+250 788 000 121' },
  { firstName: 'Peace', lastName: 'Iradukunda', email: 'finance.officer@care.demo', positionCode: 'FIN_OFF', roleKey: 'STAFF', phone: '+250 788 000 122' },
  { firstName: 'Innocent', lastName: 'Hakizimana', email: 'award.officer1@care.demo', positionCode: 'AWARD_OFF_1', roleKey: 'STAFF', phone: '+250 788 000 123' },
  { firstName: 'Sandrine', lastName: 'Uwase', email: 'award.officer2@care.demo', positionCode: 'AWARD_OFF_2', roleKey: 'STAFF', phone: '+250 788 000 124' },

  { firstName: 'Vincent', lastName: 'Gatera', email: 'pql.director@care.demo', positionCode: 'PQL_DIR', roleKey: 'DIRECTOR', phone: '+250 788 000 125' },
  { firstName: 'Chantal', lastName: 'Mukashema', email: 'meal.specialist1@care.demo', positionCode: 'MEAL_1', roleKey: 'SUPERVISOR', phone: '+250 788 000 126' },
  { firstName: 'Robert', lastName: 'Kayitare', email: 'meal.specialist2@care.demo', positionCode: 'MEAL_2', roleKey: 'SUPERVISOR', phone: '+250 788 000 127' },
  { firstName: 'Immaculee', lastName: 'Nyiransabimana', email: 'meal.specialist3@care.demo', positionCode: 'MEAL_3', roleKey: 'SUPERVISOR', phone: '+250 788 000 128' },
  { firstName: 'Kevin', lastName: 'Rugamba', email: 'communications@care.demo', positionCode: 'COMMS_SPEC', roleKey: 'STAFF', phone: '+250 788 000 129' },
];

/** Department heads, by position code. */
export const DEPARTMENT_HEADS: Record<string, string> = {
  EXEC: 'CD',
  HR: 'HR_MGR',
  PROG: 'PROG_DIR',
  OPS: 'OPS_MGR',
  FIN: 'FIN_MGR',
  PQL: 'PQL_DIR',
};

export interface ProjectSeed {
  code: string;
  name: string;
  description: string;
  departmentCode: string;
  managerPositionCode: string;
  color: string;
  startMonthsAgo: number;
  endMonthsAhead: number;
  memberPositionCodes: string[];
}

export const PROJECTS: ProjectSeed[] = [
  {
    code: 'SERVE',
    name: 'SERVE',
    description:
      'Strengthening enterprise, resilience and value chains for smallholder farmers.',
    departmentCode: 'PROG',
    managerPositionCode: 'SERVE_PM',
    color: '#0EA5E9',
    startMonthsAgo: 14,
    endMonthsAhead: 10,
    memberPositionCodes: ['SERVE_PM', 'GESI_ADV', 'VC_ADV', 'ENT_ADV', 'MEAL_1', 'FIN_OFF'],
  },
  {
    code: 'GEAR',
    name: 'GEAR',
    description: 'Girls education and adolescent resilience programme.',
    departmentCode: 'PROG',
    managerPositionCode: 'GEAR_PM',
    color: '#8B5CF6',
    startMonthsAgo: 9,
    endMonthsAhead: 14,
    memberPositionCodes: ['GEAR_PM', 'SAFEGUARD_ADV', 'MEAL_2', 'COMMS_SPEC'],
  },
  {
    code: 'PBW',
    name: 'Powered by Women',
    description: 'Women-led governance, enterprise and health rights programme.',
    departmentCode: 'PROG',
    managerPositionCode: 'PBW_PM',
    color: '#EC4899',
    startMonthsAgo: 11,
    endMonthsAhead: 12,
    memberPositionCodes: ['PBW_PM', 'GOV_ADV', 'GENDER_SRH_ADV', 'MEAL_3'],
  },
  {
    code: 'KUNGAHARA',
    name: 'KUNGAHARA',
    description: 'Household economic strengthening and nutrition programme.',
    departmentCode: 'PROG',
    managerPositionCode: 'KUNGAHARA_PM',
    color: '#10B981',
    startMonthsAgo: 6,
    endMonthsAhead: 18,
    memberPositionCodes: ['KUNGAHARA_PM', 'SPRING_ADV', 'MEAL_1', 'LOG_OFF'],
  },
  {
    code: 'SPRING',
    name: 'SPRING',
    description: 'Cross-cutting technical support and innovation portfolio.',
    departmentCode: 'PROG',
    managerPositionCode: 'SPRING_ADV',
    color: '#F59E0B',
    startMonthsAgo: 4,
    endMonthsAhead: 20,
    memberPositionCodes: ['SPRING_ADV', 'PROG_DIR', 'MEAL_2'],
  },
];

export interface TaskTypeSeed {
  code: string;
  name: string;
  description: string;
  icon: string;
}

export const TASK_TYPES: TaskTypeSeed[] = [
  { code: 'PROGRAMME_REPORT', name: 'Programme report', description: 'Narrative and data reporting to donors or management.', icon: 'FileText' },
  { code: 'PROCUREMENT', name: 'Procurement request', description: 'Purchase of goods or services.', icon: 'ShoppingCart' },
  { code: 'PAYMENT', name: 'Payment request', description: 'Payment or reimbursement requiring finance approval.', icon: 'Banknote' },
  { code: 'HR_REQUEST', name: 'HR request', description: 'Recruitment, leave and other people processes.', icon: 'Users' },
  { code: 'MEAL', name: 'MEAL activity', description: 'Data collection, verification and learning activities.', icon: 'ClipboardCheck' },
  { code: 'GENERAL', name: 'General task', description: 'Any work that does not fit a formal workflow.', icon: 'CheckSquare' },
];

export const TAGS: Array<{ name: string; color: string }> = [
  { name: 'quarterly-report', color: '#0EA5E9' },
  { name: 'donor', color: '#4338CA' },
  { name: 'urgent', color: '#EF4444' },
  { name: 'gesi', color: '#EC4899' },
  { name: 'field-data', color: '#10B981' },
  { name: 'procurement', color: '#F59E0B' },
  { name: 'compliance', color: '#8B5CF6' },
  { name: 'training', color: '#14B8A6' },
];

export interface WorkflowStageSeed {
  name: string;
  order: number;
  type: 'WORK' | 'REVIEW' | 'APPROVAL' | 'FINAL';
  assigneeMode:
    | 'SPECIFIC_USER'
    | 'POSITION'
    | 'ROLE'
    | 'DEPARTMENT_HEAD'
    | 'PROJECT_MANAGER'
    | 'MANAGER_OF_PREVIOUS'
    | 'TASK_CREATOR'
    | 'UNASSIGNED';
  positionCode?: string;
  entryStatus:
    | 'ASSIGNED'
    | 'IN_PROGRESS'
    | 'SUBMITTED'
    | 'UNDER_REVIEW'
    | 'APPROVED'
    | 'COMPLETED';
  requiresApproval?: boolean;
  slaHours?: number;
  isFinal?: boolean;
  description: string;
}

export interface WorkflowSeed {
  code: string;
  name: string;
  description: string;
  taskTypeCode: string;
  departmentCode?: string;
  isDefault?: boolean;
  stages: WorkflowStageSeed[];
}

/**
 * Workflows are configured per task type, not per org chart - different work
 * follows different routes, which is exactly what the builder configures.
 */
export const WORKFLOWS: WorkflowSeed[] = [
  {
    code: 'PROGRAMME_REPORT',
    name: 'Programme report approval',
    description:
      'Officer drafts, technical advisor reviews, project manager consolidates, Programme Director approves.',
    taskTypeCode: 'PROGRAMME_REPORT',
    departmentCode: 'PROG',
    stages: [
      { name: 'Draft report', order: 1, type: 'WORK', assigneeMode: 'UNASSIGNED', entryStatus: 'ASSIGNED', slaHours: 72, description: 'Compile field data and draft the narrative.' },
      { name: 'Technical review', order: 2, type: 'REVIEW', assigneeMode: 'POSITION', positionCode: 'GESI_ADV', entryStatus: 'UNDER_REVIEW', slaHours: 48, description: 'Technical advisor checks the content and data.' },
      { name: 'Project manager consolidation', order: 3, type: 'REVIEW', assigneeMode: 'PROJECT_MANAGER', entryStatus: 'UNDER_REVIEW', slaHours: 24, description: 'Project manager consolidates and quality-checks.' },
      { name: 'Programme Director approval', order: 4, type: 'APPROVAL', assigneeMode: 'POSITION', positionCode: 'PROG_DIR', entryStatus: 'SUBMITTED', requiresApproval: true, slaHours: 48, description: 'Final programmatic sign-off.' },
      { name: 'Completed', order: 5, type: 'FINAL', assigneeMode: 'TASK_CREATOR', entryStatus: 'COMPLETED', isFinal: true, description: 'Report approved and filed.' },
    ],
  },
  {
    code: 'PROCUREMENT',
    name: 'Procurement request',
    description: 'Request raised, processed by procurement, then approved by Operations.',
    taskTypeCode: 'PROCUREMENT',
    departmentCode: 'OPS',
    stages: [
      { name: 'Request raised', order: 1, type: 'WORK', assigneeMode: 'TASK_CREATOR', entryStatus: 'ASSIGNED', slaHours: 24, description: 'Requester completes the specification and budget line.' },
      { name: 'Procurement Officer', order: 2, type: 'WORK', assigneeMode: 'POSITION', positionCode: 'PROC_OFF', entryStatus: 'ASSIGNED', slaHours: 72, description: 'Collect quotations and prepare the comparison.' },
      { name: 'Procurement Specialist', order: 3, type: 'REVIEW', assigneeMode: 'POSITION', positionCode: 'PROC_SPEC', entryStatus: 'UNDER_REVIEW', slaHours: 48, description: 'Evaluate bids and recommend a supplier.' },
      { name: 'Operations Manager approval', order: 4, type: 'APPROVAL', assigneeMode: 'POSITION', positionCode: 'OPS_MGR', entryStatus: 'SUBMITTED', requiresApproval: true, slaHours: 48, description: 'Approve the award.' },
      { name: 'Completed', order: 5, type: 'FINAL', assigneeMode: 'TASK_CREATOR', entryStatus: 'COMPLETED', isFinal: true, description: 'Purchase order issued.' },
    ],
  },
  {
    code: 'PAYMENT',
    name: 'Payment approval',
    description: 'Finance Officer prepares, Supervisor verifies, Finance Manager approves.',
    taskTypeCode: 'PAYMENT',
    departmentCode: 'FIN',
    stages: [
      { name: 'Prepare payment', order: 1, type: 'WORK', assigneeMode: 'POSITION', positionCode: 'FIN_OFF', entryStatus: 'ASSIGNED', slaHours: 48, description: 'Check supporting documents and prepare the voucher.' },
      { name: 'Verification', order: 2, type: 'REVIEW', assigneeMode: 'POSITION', positionCode: 'FIN_SUP', entryStatus: 'UNDER_REVIEW', slaHours: 24, description: 'Verify coding, budget line and compliance.' },
      { name: 'Finance Manager approval', order: 3, type: 'APPROVAL', assigneeMode: 'POSITION', positionCode: 'FIN_MGR', entryStatus: 'SUBMITTED', requiresApproval: true, slaHours: 24, description: 'Authorise the payment.' },
      { name: 'Completed', order: 4, type: 'FINAL', assigneeMode: 'TASK_CREATOR', entryStatus: 'COMPLETED', isFinal: true, description: 'Payment released.' },
    ],
  },
];

WORKFLOWS.push(
  {
    code: 'HR_REQUEST',
    name: 'HR request',
    description: 'HR Officer processes, HR Manager reviews, Country Director signs off.',
    taskTypeCode: 'HR_REQUEST',
    departmentCode: 'HR',
    stages: [
      { name: 'HR Officer processing', order: 1, type: 'WORK', assigneeMode: 'POSITION', positionCode: 'HR_OFF', entryStatus: 'ASSIGNED', slaHours: 48, description: 'Prepare documentation and check policy.' },
      { name: 'HR Manager review', order: 2, type: 'REVIEW', assigneeMode: 'POSITION', positionCode: 'HR_MGR', entryStatus: 'UNDER_REVIEW', slaHours: 24, description: 'Review against HR policy.' },
      { name: 'Country Director approval', order: 3, type: 'APPROVAL', assigneeMode: 'POSITION', positionCode: 'CD', entryStatus: 'SUBMITTED', requiresApproval: true, slaHours: 72, description: 'Executive sign-off.' },
      { name: 'Completed', order: 4, type: 'FINAL', assigneeMode: 'TASK_CREATOR', entryStatus: 'COMPLETED', isFinal: true, description: 'Request closed.' },
    ],
  },
  {
    code: 'MEAL_REVIEW',
    name: 'MEAL data verification',
    description: 'MEAL specialist verifies field data before the PQL Director signs it off.',
    taskTypeCode: 'MEAL',
    departmentCode: 'PQL',
    stages: [
      { name: 'Data collection', order: 1, type: 'WORK', assigneeMode: 'UNASSIGNED', entryStatus: 'ASSIGNED', slaHours: 96, description: 'Collect and clean the field data.' },
      { name: 'MEAL verification', order: 2, type: 'REVIEW', assigneeMode: 'POSITION', positionCode: 'MEAL_1', entryStatus: 'UNDER_REVIEW', slaHours: 48, description: 'Verify data quality and completeness.' },
      { name: 'PQL Director sign-off', order: 3, type: 'APPROVAL', assigneeMode: 'POSITION', positionCode: 'PQL_DIR', entryStatus: 'SUBMITTED', requiresApproval: true, slaHours: 48, description: 'Approve the dataset for use.' },
      { name: 'Completed', order: 4, type: 'FINAL', assigneeMode: 'TASK_CREATOR', entryStatus: 'COMPLETED', isFinal: true, description: 'Dataset published.' },
    ],
  },
  {
    code: 'GENERAL',
    name: 'Simple task',
    description: 'Assignee works, line manager reviews and closes. Used when no formal route applies.',
    taskTypeCode: 'GENERAL',
    isDefault: true,
    stages: [
      { name: 'Work', order: 1, type: 'WORK', assigneeMode: 'UNASSIGNED', entryStatus: 'ASSIGNED', slaHours: 72, description: 'Do the work and submit it.' },
      { name: 'Review', order: 2, type: 'REVIEW', assigneeMode: 'MANAGER_OF_PREVIOUS', entryStatus: 'UNDER_REVIEW', slaHours: 48, description: 'Line manager reviews the submission.' },
      { name: 'Completed', order: 3, type: 'FINAL', assigneeMode: 'TASK_CREATOR', entryStatus: 'COMPLETED', isFinal: true, description: 'Work accepted.' },
    ],
  },
);
