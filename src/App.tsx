import { useEffect, useState } from "react";
import {
  Bell, CalendarBlank, ChartBar, CurrencyCircleDollar, Gear, House, ShieldCheck, SteeringWheel,
} from "@phosphor-icons/react";
import { AppProvider, useApp } from "./store";
import { signOut as signOutNow } from "./lib/auth";
import { IS_DEMO } from "./lib/supabase";
import { resetDemo } from "./lib/api";
import { Spinner } from "./components/app/ui";
import Login from "./screens/Login";
import JoinOrg from "./screens/JoinOrg";
import AwaitingApproval from "./screens/AwaitingApproval";
import Admin from "./screens/Admin";
import Suspended from "./screens/Suspended";
import Home from "./screens/Home";
import Board from "./screens/Board";
import RideDetail from "./screens/RideDetail";
import MyRides from "./screens/MyRides";
import Money from "./screens/Money";
import DriverSpace from "./screens/DriverSpace";
import Manage from "./screens/Manage";
import Notifications from "./screens/Notifications";
import Settings from "./screens/Settings";

// ניתוב פשוט מבוסס כתובת — בלי ספריית ניתוב, כדי לשמור על הכלי קל.
function useRoute() {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || "/");
  useEffect(() => {
    const onChange = () => setRoute(window.location.hash.slice(1) || "/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export const go = (path: string) => { window.location.hash = path; };

const TABS = [
  { path: "/", label: "בית", Icon: House },
  { path: "/board", label: "לוח נסיעות", Icon: CalendarBlank },
  { path: "/mine", label: "שלי", Icon: SteeringWheel },
  { path: "/money", label: "כספים", Icon: CurrencyCircleDollar },
] as const;

function Toast() {
  const { toast, clearToast } = useApp();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, toast.kind === "error" ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [toast, clearToast]);
  if (!toast) return null;
  return (
    <div role="status" aria-live="polite"
      className="fixed inset-x-0 top-3 z-50 flex justify-center px-4 pointer-events-none">
      <div
        onClick={clearToast}
        className={`pointer-events-auto max-w-md w-full rounded-[var(--radius)] px-4 py-3
          text-sm font-medium cursor-pointer shadow-[var(--shadow-3)] enter ${
          toast.kind === "error"
            ? "bg-[hsl(var(--danger))] text-white"
            : "bg-[hsl(var(--ok))] text-[hsl(var(--primary-foreground))]"
        }`}
      >
        {toast.text}
      </div>
    </div>
  );
}

function Header() {
  const { org, me, unreadCount, accountEmail, signedIn, isPlatformAdmin } = useApp();
  // התראות והגדרות נפתחות רק לחבר מאושר. לממתין לאישור אין עדיין גישה
  // לנתונים שהמסכים האלה מציגים, ולחיצה עליהם הייתה מובילה למסך ריק.
  const active = signedIn && me?.status === "active";
  return (
    <header className="sticky top-0 z-30 bg-background/88 backdrop-blur-md border-b border-border">
      <div className="screen flex items-center justify-between h-14">
        <div className="min-w-0">
          {/* לפני החיבור לצוות אין עדיין שם ארגון, ולכן מוצג שם הכלי והחשבון */}
          <p className="font-bold leading-tight truncate">
            {signedIn ? org?.name : "נסיעות שיתופיות"}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {signedIn
              ? <>{me?.name}{me?.role === "manager" && " · מנהל"}</>
              : <span className="num">{accountEmail}</span>}
          </p>
        </div>
        {!active ? (
          <div className="flex items-center gap-0.5">
          {isPlatformAdmin && (
            <button onClick={() => go("/admin")} aria-label="בקשות לפתיחת ארגון"
              className="h-10 w-10 grid place-items-center rounded-[var(--radius)]
                         text-muted-foreground hover:bg-secondary hover:text-foreground
                         transition-colors active:translate-y-[1px]">
              <ShieldCheck size={21} />
            </button>
          )}
          <button onClick={() => void signOutNow()} aria-label="יציאה"
            className="h-10 px-3 grid place-items-center rounded-[var(--radius)] text-sm
                       text-muted-foreground hover:bg-secondary hover:text-foreground
                       transition-colors active:translate-y-[1px]">
            יציאה
          </button>
          </div>
        ) : (
        <div className="flex items-center gap-0.5">
          {isPlatformAdmin && (
            <button onClick={() => go("/admin")} aria-label="בקשות לפתיחת ארגון"
              className="h-10 w-10 grid place-items-center rounded-[var(--radius)]
                         text-muted-foreground hover:bg-secondary hover:text-foreground
                         transition-colors active:translate-y-[1px]">
              <ShieldCheck size={21} />
            </button>
          )}
          <button onClick={() => go("/notifications")} aria-label="התראות"
            className="relative h-10 w-10 grid place-items-center rounded-[var(--radius)]
                       text-muted-foreground hover:bg-secondary hover:text-foreground
                       transition-colors active:translate-y-[1px]">
            <Bell size={21} weight={unreadCount > 0 ? "fill" : "regular"} />
            {unreadCount > 0 && (
              <span className="absolute top-1 left-1 min-w-[18px] h-[18px] px-1 rounded-full
                bg-[hsl(var(--danger))] text-white text-[11px] font-bold grid place-items-center num">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          <button onClick={() => go("/settings")} aria-label="הגדרות"
            className="h-10 w-10 grid place-items-center rounded-[var(--radius)]
                       text-muted-foreground hover:bg-secondary hover:text-foreground
                       transition-colors active:translate-y-[1px]">
            <Gear size={21} />
          </button>
        </div>
        )}
      </div>
    </header>
  );
}

function BottomNav({ route }: { route: string }) {
  const { isManager } = useApp();
  const tabs = isManager
    ? [...TABS, { path: "/manage", label: "ניהול", Icon: ChartBar } as const]
    : TABS;
  const active = (p: string) => (p === "/" ? route === "/" : route.startsWith(p));

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 bg-card/92 backdrop-blur-md border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="screen flex">
        {tabs.map(({ path, label, Icon }) => {
          const on = active(path);
          return (
            <button
              key={path}
              onClick={() => go(path)}
              aria-current={on ? "page" : undefined}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px]
                transition-colors active:translate-y-[1px] ${
                on ? "text-[hsl(var(--primary))] font-bold" : "text-muted-foreground"
              }`}
            >
              <Icon size={22} weight={on ? "fill" : "regular"} />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** שורה קבועה בראש המסך במצב הדגמה, כדי שלא יהיה ספק מה רואים */
function DemoBanner() {
  if (!IS_DEMO) return null;
  return (
    <div className="bg-[hsl(var(--warn-soft))] text-[hsl(var(--warn))] text-center
                    text-xs font-semibold py-2 px-4 leading-relaxed">
      מצב הדגמה — הנתונים כאן לדוגמה בלבד, רצים בדפדפן שלך ולא נשמרים בשום מקום.
      <button onClick={() => { resetDemo(); window.location.reload(); }}
        className="underline mr-2 font-bold">איפוס</button>
    </div>
  );
}

/**
 * מסך לכל מי שהגיע לכתובת של מנהל המערכת בלי ההרשאה.
 *
 * זו הודעה בלבד ולא ההגנה עצמה: ההגנה יושבת במסד הנתונים, שם כל פונקציה
 * של מנהל מערכת בודקת בעצמה מי קורא לה. גם מי שיעקוף את המסך הזה לגמרי
 * לא יקבל שורה אחת של נתונים.
 */
function NoAccess() {
  return (
    <div className="card-surface p-6 text-center shadow-[var(--shadow-2)]">
      <div className="mx-auto mb-4 h-12 w-12 grid place-items-center rounded-full
                      bg-secondary text-muted-foreground">
        <ShieldCheck size={24} />
      </div>
      <h1 className="text-xl font-bold">האזור הזה סגור</h1>
      <p className="text-muted-foreground mt-2 leading-relaxed">
        מסך ניהול המערכת פתוח רק למי שמתפעל את המערכת.
      </p>
      <button onClick={() => go("/")}
        className="mt-5 text-sm text-muted-foreground hover:underline">
        חזרה לדף הבית
      </button>
    </div>
  );
}

function Router() {
  const route = useRoute();
  const { ready, authed, signedIn, me, error, refresh, isPlatformAdmin, blocked } = useApp();

  if (!ready) return <Spinner label="טוען…" />;

  if (error && !authed) {
    return (
      <div className="screen py-16 text-center">
        <p className="mb-3">{error}</p>
        <button onClick={() => void refresh()} className="underline">נסה שוב</button>
      </div>
    );
  }

  if (!authed) return <Login onDone={() => void refresh()} />;

  // מנהל מערכת מגיע למסך הניהול בכל מצב, גם אם הוא עצמו לא חבר בשום ארגון.
  // מי שאינו מנהל מערכת מקבל הודעה מפורשת ולא מסך ריק, כדי שלא ייראה כאילו
  // משהו נשבר — וגם כדי שלא יישאר ספק שהאזור סגור ולא סתם לא נטען.
  if (route.startsWith("/admin")) {
    return (
      <>
        <Header />
        <main className="screen pt-5 pad-nav">
          {isPlatformAdmin ? <Admin /> : <NoAccess />}
        </main>
        {signedIn && me?.status === "active" && <BottomNav route={route} />}
      </>
    );
  }

  // חשבון או ארגון שהושהו בידי מנהל מערכת
  if (blocked) {
    return (
      <>
        <Header />
        <main className="screen py-6"><Suspended kind={blocked} /></main>
      </>
    );
  }

  // מחובר אבל עדיין לא משויך לצוות: כבר בתוך האתר, נשאר צעד אחד.
  if (!signedIn) {
    return (
      <>
        <Header />
        <main className="screen py-6">
          <JoinOrg onDone={() => void refresh()} />
        </main>
      </>
    );
  }

  // הצטרף אבל המנהל עדיין לא אישר — או שנחסם
  if (me && me.status !== "active") {
    return (
      <>
        <Header />
        <main className="screen py-6"><AwaitingApproval /></main>
      </>
    );
  }

  const rideMatch = route.match(/^\/ride\/(.+)$/);

  return (
    <>
      <DemoBanner />
      <Header />
      <main className="screen pt-5 pad-nav">
        {route === "/" && <Home />}
        {route === "/board" && <Board />}
        {route === "/mine" && <MyRides />}
        {route === "/drive" && <DriverSpace />}
        {route === "/money" && <Money />}
        {route === "/manage" && <Manage />}
        {route === "/notifications" && <Notifications />}
        {route === "/settings" && <Settings />}
        {rideMatch && <RideDetail rideId={rideMatch[1]} />}
      </main>
      <BottomNav route={route} />
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Toast />
      <Router />
    </AppProvider>
  );
}
