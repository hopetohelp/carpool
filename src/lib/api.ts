import { IS_DEMO } from "./supabase";
import * as live from "./apiLive";
import * as demo from "./apiDemo";

// ============================================================================
// שכבת הגישה לנתונים
//
// במצב רגיל הכל עובר למסד הנתונים. במצב הדגמה הכל עובר לעותק בזיכרון
// הדפדפן: שום פנייה לרשת, שום שורה שנשמרת, ושום חשבון שנוצר.
//
// ההחלפה נעשית כאן ולא בכל מסך בנפרד, כדי שאף מסך לא יצטרך לדעת באיזה
// מצב הוא רץ ולא ייווצר מצב שבו מסך אחד שכח לבדוק.
// ============================================================================

const impl: typeof live = IS_DEMO ? (demo as unknown as typeof live) : live;

export const loadMe: typeof live.loadMe = (...a: Parameters<typeof live.loadMe>) =>
  (impl.loadMe as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.loadMe>;
export const listMembers: typeof live.listMembers = (...a: Parameters<typeof live.listMembers>) =>
  (impl.listMembers as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.listMembers>;
export const listContacts: typeof live.listContacts = (...a: Parameters<typeof live.listContacts>) =>
  (impl.listContacts as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.listContacts>;
export const upsertMyContact: typeof live.upsertMyContact = (...a: Parameters<typeof live.upsertMyContact>) =>
  (impl.upsertMyContact as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.upsertMyContact>;
export const updateMember: typeof live.updateMember = (...a: Parameters<typeof live.updateMember>) =>
  (impl.updateMember as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.updateMember>;
export const listStops: typeof live.listStops = (...a: Parameters<typeof live.listStops>) =>
  (impl.listStops as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.listStops>;
export const createStop: typeof live.createStop = (...a: Parameters<typeof live.createStop>) =>
  (impl.createStop as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.createStop>;
export const deleteStop: typeof live.deleteStop = (...a: Parameters<typeof live.deleteStop>) =>
  (impl.deleteStop as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.deleteStop>;
export const listRides: typeof live.listRides = (...a: Parameters<typeof live.listRides>) =>
  (impl.listRides as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.listRides>;
export const getRide: typeof live.getRide = (...a: Parameters<typeof live.getRide>) =>
  (impl.getRide as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.getRide>;
export const listBookingsForRides: typeof live.listBookingsForRides = (...a: Parameters<typeof live.listBookingsForRides>) =>
  (impl.listBookingsForRides as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.listBookingsForRides>;
export const myBookings: typeof live.myBookings = (...a: Parameters<typeof live.myBookings>) =>
  (impl.myBookings as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.myBookings>;
export const createRide: typeof live.createRide = (...a: Parameters<typeof live.createRide>) =>
  (impl.createRide as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.createRide>;
export const updateRide: typeof live.updateRide = (...a: Parameters<typeof live.updateRide>) =>
  (impl.updateRide as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.updateRide>;
export const requestBooking: typeof live.requestBooking = (...a: Parameters<typeof live.requestBooking>) =>
  (impl.requestBooking as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.requestBooking>;
export const decideBooking: typeof live.decideBooking = (...a: Parameters<typeof live.decideBooking>) =>
  (impl.decideBooking as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.decideBooking>;
export const cancelBooking: typeof live.cancelBooking = (...a: Parameters<typeof live.cancelBooking>) =>
  (impl.cancelBooking as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.cancelBooking>;
export const closeRide: typeof live.closeRide = (...a: Parameters<typeof live.closeRide>) =>
  (impl.closeRide as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.closeRide>;
export const cancelRide: typeof live.cancelRide = (...a: Parameters<typeof live.cancelRide>) =>
  (impl.cancelRide as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.cancelRide>;
export const logManualRide: typeof live.logManualRide = (...a: Parameters<typeof live.logManualRide>) =>
  (impl.logManualRide as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.logManualRide>;
export const markPayment: typeof live.markPayment = (...a: Parameters<typeof live.markPayment>) =>
  (impl.markPayment as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.markPayment>;
export const confirmPayment: typeof live.confirmPayment = (...a: Parameters<typeof live.confirmPayment>) =>
  (impl.confirmPayment as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.confirmPayment>;
export const disputePayment: typeof live.disputePayment = (...a: Parameters<typeof live.disputePayment>) =>
  (impl.disputePayment as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.disputePayment>;
export const closeMonth: typeof live.closeMonth = (...a: Parameters<typeof live.closeMonth>) =>
  (impl.closeMonth as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.closeMonth>;
export const listBalances: typeof live.listBalances = (...a: Parameters<typeof live.listBalances>) =>
  (impl.listBalances as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.listBalances>;
export const listCharges: typeof live.listCharges = (...a: Parameters<typeof live.listCharges>) =>
  (impl.listCharges as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.listCharges>;
export const listPayments: typeof live.listPayments = (...a: Parameters<typeof live.listPayments>) =>
  (impl.listPayments as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.listPayments>;
export const listSettlements: typeof live.listSettlements = (...a: Parameters<typeof live.listSettlements>) =>
  (impl.listSettlements as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.listSettlements>;
export const listTemplates: typeof live.listTemplates = (...a: Parameters<typeof live.listTemplates>) =>
  (impl.listTemplates as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.listTemplates>;
export const createTemplate: typeof live.createTemplate = (...a: Parameters<typeof live.createTemplate>) =>
  (impl.createTemplate as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.createTemplate>;
export const deactivateTemplate: typeof live.deactivateTemplate = (...a: Parameters<typeof live.deactivateTemplate>) =>
  (impl.deactivateTemplate as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.deactivateTemplate>;
export const subscribeToTemplate: typeof live.subscribeToTemplate = (...a: Parameters<typeof live.subscribeToTemplate>) =>
  (impl.subscribeToTemplate as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.subscribeToTemplate>;
export const unsubscribeFromTemplate: typeof live.unsubscribeFromTemplate = (...a: Parameters<typeof live.unsubscribeFromTemplate>) =>
  (impl.unsubscribeFromTemplate as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.unsubscribeFromTemplate>;
export const listMySubscriptions: typeof live.listMySubscriptions = (...a: Parameters<typeof live.listMySubscriptions>) =>
  (impl.listMySubscriptions as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.listMySubscriptions>;
export const listTrusted: typeof live.listTrusted = (...a: Parameters<typeof live.listTrusted>) =>
  (impl.listTrusted as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.listTrusted>;
export const addTrusted: typeof live.addTrusted = (...a: Parameters<typeof live.addTrusted>) =>
  (impl.addTrusted as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.addTrusted>;
export const removeTrusted: typeof live.removeTrusted = (...a: Parameters<typeof live.removeTrusted>) =>
  (impl.removeTrusted as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.removeTrusted>;
export const listNotifications: typeof live.listNotifications = (...a: Parameters<typeof live.listNotifications>) =>
  (impl.listNotifications as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.listNotifications>;
export const markNotificationRead: typeof live.markNotificationRead = (...a: Parameters<typeof live.markNotificationRead>) =>
  (impl.markNotificationRead as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.markNotificationRead>;
export const markAllNotificationsRead: typeof live.markAllNotificationsRead = (...a: Parameters<typeof live.markAllNotificationsRead>) =>
  (impl.markAllNotificationsRead as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.markAllNotificationsRead>;
export const onNewNotification: typeof live.onNewNotification = (...a: Parameters<typeof live.onNewNotification>) =>
  (impl.onNewNotification as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.onNewNotification>;
export const onRideActivity: typeof live.onRideActivity = (...a: Parameters<typeof live.onRideActivity>) =>
  (impl.onRideActivity as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.onRideActivity>;
export const updateOrgSettings: typeof live.updateOrgSettings = (...a: Parameters<typeof live.updateOrgSettings>) =>
  (impl.updateOrgSettings as (...x: unknown[]) => unknown)(...a) as ReturnType<typeof live.updateOrgSettings>;

export { resetDemo } from "./apiDemo";
