import { useEffect, useRef, type ReactNode } from "react";
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";

const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const stripBase = (path: string) => basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
const appearance = {
  theme: "simple" as const,
  cssLayerName: "clerk",
  options: { logoPlacement: "inside" as const, logoLinkUrl: basePath || "/", logoImageUrl: `${window.location.origin}${basePath}/auth-logo.svg` },
  variables: {
    colorPrimary: "#22d3ee", colorForeground: "#e4e4e7", colorMutedForeground: "#a1a1aa",
    colorDanger: "#fda4af", colorBackground: "#090f12", colorInput: "#09090b", colorInputForeground: "#e4e4e7",
    colorNeutral: "#e4e4e7", fontFamily: "Geist, sans-serif", borderRadius: "0.6rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#090f12] border border-cyan-500/30 rounded-2xl w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-zinc-100", headerSubtitle: "text-zinc-400", socialButtonsBlockButtonText: "text-zinc-100",
    formFieldLabel: "text-zinc-200", footerActionLink: "text-cyan-300", footerActionText: "text-zinc-400",
    dividerText: "text-zinc-400", identityPreviewEditButton: "text-cyan-300",
    formFieldSuccessText: "text-emerald-300", alertText: "text-rose-200",
    formButtonPrimary: "bg-cyan-400 text-zinc-950", formFieldInput: "bg-zinc-950 text-zinc-100 border-zinc-700",
  },
};

function AuthCache() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const id = user?.id ?? null;
    if (previous.current !== undefined && previous.current !== id) qc.clear();
    previous.current = id;
  }), [addListener, qc]);
  return null;
}
export function AuthShell({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={appearance}
    signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{ signIn: { start: { title: "Verify your identity", subtitle: "Sign in to request administrator-only Patchwork merges" } },
      signUp: { start: { title: "Join Patchwork", subtitle: "Signing up does not grant merge permissions" } } }}
    routerPush={to => setLocation(stripBase(to))} routerReplace={to => setLocation(stripBase(to), { replace: true })}>
    <AuthCache />{children}
  </ClerkProvider>;
}
export function SignInPage() {
  return <div className="min-h-screen flex flex-col items-center justify-center gap-5 p-4"><Link href="/" className="text-sm text-cyan-300" data-testid="link-auth-home">Back to Patchwork</Link>
    <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/dashboard`} />
  </div>;
}
export function SignUpPage() {
  return <div className="min-h-screen flex flex-col items-center justify-center gap-5 p-4"><Link href="/" className="text-sm text-cyan-300" data-testid="link-signup-home">Back to Patchwork</Link>
    <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={`${basePath}/dashboard`} />
  </div>;
}
export function AuthControls() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  if (!isLoaded) return <span className="text-xs text-zinc-500">Checking session…</span>;
  return user ? <button data-testid="button-sign-out" onClick={() => signOut({ redirectUrl: basePath || "/" })} className="text-xs text-zinc-400 hover:text-cyan-300">Sign out</button>
    : <Link href="/sign-in" data-testid="link-sign-in" className="text-xs text-cyan-300">Admin sign in</Link>;
}
