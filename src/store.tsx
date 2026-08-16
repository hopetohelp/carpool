import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import type { ReactNode } from "react";
import { IS_DEMO, supabase } from "./lib/supabase";
import * as api from "./lib/api";
import { isPlatformAdmin } from "./lib/auth";
import { accountStatus, recordLogin } from "./lib/admin";
import type {
  AppNotification, Balance, Booking, Charge, Member, MemberContact,
  Org, Payment, Ride, RideTemplate, Stop,
} from "./lib/types";
import { addDays, isoDate, startOfWeek } from "./lib/format";

// ============================================================================
// מצב האפליקציה במקום אחד.
// כל המסכים קוראים מכאן, וכל פעולה מרעננת רק את מה שהשתנה.
// ============================================================================

interface State {
  ready: boolean;
  /** יש חשבון מחובר — גם אם הוא עדיין לא משויך לארגון */
  authed: boolean;
  /** מחובר ומשויך לארגון — כלומר אפשר להשתמש בכלי */
  signedIn: boolean;
  /** המייל של החשבון המחובר — מוצג לפני שיש שיוך לארגון */
  accountEmail: string;
  /** מנהל מערכת: תפקיד מעל הארגונים, מאשר פתיחת ארגונים חדשים */
  isPlatformAdmin: boolean;
  /** החשבון או הארגון הושהו בידי מנהל מערכת — הכלי נעצר ומוצג הסבר */
  blocked: "user" | "org" | null;
  me: Member | null;
  org: Org | null;
  members: Member[];
  contacts: MemberContact[];
  stops: Stop[];
  rides: Ride[];
  bookings: Booking[];
  templates: RideTemplate[];
  balances: Balance[];
  charges: Charge[];
  payments: Payment[];
  notifications: AppNotification[];
  subscriptions: { template_id: string }[];
  error: string | null;
}

interface Store extends State {
  isManager: boolean;
  unreadCount: number;
  memberById: (id: string) => Member | undefined;
  contactOf: (id: string) => MemberContact | undefined;
  stopById: (id: string | null) => Stop | undefined;
  bookingsOf: (rideId: string) => Booking[];
  myBookingFor: (rideId: string) => Booking | undefined;
  refresh: () => Promise<void>;
  refreshMoney: () => Promise<void>;
  run: <T>(fn: () => Promise<T>, okMessage?: string) => Promise<T | null>;
  toast: { text: string; kind: "ok" | "error" } | null;
  clearToast: () => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

const EMPTY: State = {
  ready: false, authed: false, signedIn: false, accountEmail: "",
  isPlatformAdmin: false, blocked: null, me: null, org: null,
  members: [], contacts: [], stops: [], rides: [], bookings: [],
  templates: [], balances: [], charges: [], payments: [],
  notifications: [], subscriptions: [], error: null,
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(EMPTY);
  const [toast, setToast] = useState<Store["toast"]>(null);
  const cleanupRef = useRef<(() => void)[]>([]);
  /** ספירת הכניסה נעשית פעם אחת לכל פתיחה של הדף, לא בכל רענון נתונים */
  const loginCounted = useRef(false);

  const loadAll = useCallback(async () => {
    // שלושה מצבים נפרדים: אין חשבון · יש חשבון בלי ארגון · הכל מוכן.
    // בלי ההפרדה הזו מי שנרשם זה עתה היה מוחזר למסך הכניסה בלולאה.
    // במצב הדגמה אין חשבון ואין רשת: נכנסים ישר לנתונים שבזיכרון
    let accountEmail = "";
    let platformAdmin = false;
    if (!IS_DEMO) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setState({ ...EMPTY, ready: true, authed: false, signedIn: false });
        return;
      }
      accountEmail = session.user.email ?? "";
      if (!loginCounted.current) {
        loginCounted.current = true;
        void recordLogin();
      }

      const [admin, status] = await Promise.all([isPlatformAdmin(), accountStatus()]);
      platformAdmin = admin;

      // חשבון או ארגון שהושהו: לא טוענים שום נתון, רק את מה שנחוץ להסבר.
      // ממילא כל הטבלאות סגורות בפניהם — טעינה כאן הייתה מחזירה רשימות
      // ריקות ומציגה כלי שנראה שבור במקום להסביר מה קרה.
      if (status === "user_suspended" || status === "org_suspended") {
        const who = await api.loadMe().catch(() => null);
        setState({
          ...EMPTY, ready: true, authed: true, signedIn: false, accountEmail,
          isPlatformAdmin: platformAdmin,
          blocked: status === "user_suspended" ? "user" : "org",
          me: who?.member ?? null, org: who?.org ?? null,
        });
        return;
      }
    }

    const identity = await api.loadMe();
    if (!identity) {
      setState({ ...EMPTY, ready: true, authed: true, signedIn: false, accountEmail,
                 isPlatformAdmin: platformAdmin });
      return;
    }
    const { member, org } = identity;

    // חלון הנסיעות שנטען: שבוע אחורה כדי לראות היסטוריה קרובה,
    // וחודש קדימה כדי לכסות את הנסיעות הקבועות שכבר פורסמו.
    const from = isoDate(addDays(startOfWeek(new Date()), -7));
    const to = isoDate(addDays(new Date(), 35));

    const [
      members, contacts, stops, rides, templates,
      balances, charges, payments, notifications, subs,
    ] = await Promise.all([
      api.listMembers(), api.listContacts(), api.listStops(),
      api.listRides(from, to), api.listTemplates(),
      api.listBalances(), api.listCharges(), api.listPayments(),
      api.listNotifications(), api.listMySubscriptions(member.id),
    ]);

    const bookings = await api.listBookingsForRides(rides.map((r) => r.id));

    setState({
      ready: true, authed: true, signedIn: true, accountEmail,
      isPlatformAdmin: platformAdmin, blocked: null, me: member, org,
      members, contacts, stops, rides, bookings, templates,
      balances, charges, payments, notifications,
      subscriptions: subs as { template_id: string }[],
      error: null,
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      await loadAll();
    } catch (e) {
      setState((s) => ({ ...s, ready: true, error: (e as Error).message }));
    }
  }, [loadAll]);

  const refreshMoney = useCallback(async () => {
    const [balances, charges, payments] = await Promise.all([
      api.listBalances(), api.listCharges(), api.listPayments(),
    ]);
    setState((s) => ({ ...s, balances, charges, payments }));
  }, []);

  /** מריץ פעולה, מציג הודעה, ומרענן — כדי שכל מסך לא יחזור על אותו טיפול בשגיאות */
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, okMessage?: string): Promise<T | null> => {
      try {
        const result = await fn();
        await refresh();
        if (okMessage) setToast({ text: okMessage, kind: "ok" });
        return result;
      } catch (e) {
        setToast({ text: (e as Error).message, kind: "error" });
        return null;
      }
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void refresh();
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  // מנויים לעדכונים בזמן אמת — נסגרים ונפתחים מחדש כשמתחלף המשתמש
  useEffect(() => {
    cleanupRef.current.forEach((fn) => fn());
    cleanupRef.current = [];
    if (!state.me || !state.org) return;

    cleanupRef.current.push(
      api.onNewNotification(state.me.id, (n) => {
        setState((s) => ({ ...s, notifications: [n, ...s.notifications] }));
        setToast({ text: n.title, kind: "ok" });
      }),
      api.onRideActivity(state.org.id, () => { void refresh(); }),
    );
    return () => {
      cleanupRef.current.forEach((fn) => fn());
      cleanupRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.me?.id, state.org?.id]);

  const value = useMemo<Store>(() => {
    const memberMap = new Map(state.members.map((m) => [m.id, m]));
    const contactMap = new Map(state.contacts.map((c) => [c.member_id, c]));
    const stopMap = new Map(state.stops.map((s) => [s.id, s]));

    return {
      ...state,
      isManager: state.me?.role === "manager",
      unreadCount: state.notifications.filter((n) => !n.read_at).length,
      memberById: (id) => memberMap.get(id),
      contactOf: (id) => contactMap.get(id),
      stopById: (id) => (id ? stopMap.get(id) : undefined),
      bookingsOf: (rideId) => state.bookings.filter((b) => b.ride_id === rideId),
      myBookingFor: (rideId) =>
        state.bookings.find(
          (b) => b.ride_id === rideId && b.passenger_id === state.me?.id &&
            !["cancelled", "rejected"].includes(b.status),
        ),
      refresh, refreshMoney, run,
      toast,
      clearToast: () => setToast(null),
      signOut: async () => {
        if (IS_DEMO) { window.location.href = window.location.pathname; return; }
        await supabase.auth.signOut();
        setState({ ...EMPTY, ready: true, authed: false, signedIn: false });
      },
    };
  }, [state, toast, refresh, refreshMoney, run]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
