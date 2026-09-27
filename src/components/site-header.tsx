import Link from "next/link";
import { canModerate, getViewer, isForeignTeam } from "@/lib/auth/team";
import { logoutAction } from "@/app/actions";
import { Avatar } from "@/components/ui/avatar";
import { HeaderSearch } from "./header-search";
import { NavLinks } from "./nav-links";
import { TeamSwitcher } from "./team-switcher";

export async function SiteHeader() {
  const viewer = await getViewer();
  const user = viewer?.user ?? null;

  // The door pages are all an outsider can reach, so the header does not
  // advertise an interior every link of which would bounce them back to login.
  if (!viewer) {
    return (
      <header className="border-b border-ink bg-paper">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-baseline gap-3">
            <span className="wordmark text-[26px] sm:text-[30px]">yapped.</span>
            <span className="hidden leading-[1.35] sm:block">
              <span className="label block">things that should&apos;ve stayed in the meeting</span>
              <span className="label block text-[9px] tracking-[0.16em] opacity-55">
                permanent record of questionable statements
              </span>
            </span>
          </Link>
          <span className="label ml-auto hidden sm:block">closed archive · members only</span>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-30 border-b border-ink bg-paper/95 backdrop-blur-[2px]">
      <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-baseline gap-3">
          <span className="wordmark text-[26px] sm:text-[30px]">yapped.</span>
          <span className="hidden leading-[1.35] sm:block">
            <span className="label block">things that should&apos;ve stayed in the meeting</span>
            <span className="label block text-[9px] tracking-[0.16em] opacity-55">
              permanent record of questionable statements
            </span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <HeaderSearch />
          <Link href="/submit" className="btn btn-acid">
            + Yap
          </Link>
          {user ? (
            <div className="flex items-center gap-2">
              <Link href={`/yapper/${user.id}`} title={user.displayName}>
                <Avatar name={user.displayName} src={user.avatarUrl} size={34} />
              </Link>
              <form action={logoutAction} className="hidden sm:block">
                <button type="submit" className="label hover:text-ink">
                  Exit
                </button>
              </form>
            </div>
          ) : (
            <Link href="/login" className="btn">
              Sign in
            </Link>
          )}
        </div>
      </div>

      <div className="mx-auto flex max-w-[1400px] items-center gap-4 border-t border-ink px-4 sm:px-6 lg:px-8">
        <NavLinks />
        {/* Right slot, always occupied, so the nav row never changes height. */}
        <div className="ml-auto hidden items-center gap-3 lg:flex">
          {/* Anyone can bring someone in, so this is not an admin control. */}
          <Link href="/invite" className="label hover:text-ink">
            Invite
          </Link>
          {canModerate(viewer) ? (
            <Link href="/admin" className="label hover:text-ink">
              Admin
            </Link>
          ) : null}
          {viewer.user.isAdmin ? (
            <Link href="/admin/instance" className="label hover:text-ink">
              Instance
            </Link>
          ) : null}
          <TeamSwitcher active={viewer.team} teams={viewer.teams} />
        </div>
      </div>

      {/* Never silent: an operator inside someone else's archive is told so on
          every page, and handed the way back out. */}
      {isForeignTeam(viewer) ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink bg-acid px-4 py-1.5 sm:px-6 lg:px-8">
          <span className="label-strong">
            Operator view · you are not a member of {viewer.team.name}
          </span>
          <Link href="/admin/instance" className="label ml-auto hover:opacity-70">
            Back to every archive
          </Link>
        </div>
      ) : null}
    </header>
  );
}
