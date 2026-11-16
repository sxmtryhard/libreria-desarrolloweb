import Link from "next/link";
import type { MyLoan, OverdueLoansResponse } from "../schema";
import { formatPesos } from "./desk-messages";
import {
  daysLateLabel,
  formatLibraryDateTime,
  loanCountLabel,
  loanStatusLabel,
  MY_LOANS_MESSAGES,
  myLoanTitle,
  showsOverdueWarning,
} from "./my-loans-view";

const CARD_CLASS = "h-full rounded-lg border border-line bg-surface-alt p-4";
const LINK_CLASS = "inline-flex min-h-11 items-center underline";

function statusClass(overdue: boolean): string {
  if (overdue) {
    return "mt-2 font-semibold text-danger";
  }
  return "mt-2 font-semibold text-primary-strong";
}

/** Aviso para el personal, que no tiene préstamos propios (spec F35, regla 1.4). */
export function StaffNotice() {
  return (
    <>
      <p role="status" className="mt-6 font-semibold">
        {MY_LOANS_MESSAGES.staffOnly}
      </p>
      <p className="mt-2">
        <Link href="/prestamos" className={LINK_CLASS}>
          Ir a Préstamos
        </Link>
      </p>
    </>
  );
}

function LoanCard({ loan, now }: { loan: MyLoan; now: Date }) {
  return (
    <article className={CARD_CLASS}>
      <h2 className="break-words text-lg font-semibold text-primary-strong">{myLoanTitle(loan)}</h2>
      {loan.book_author !== null && <p className="break-words">{loan.book_author}</p>}
      <p className="mt-2 text-ink-muted">
        Prestado el <time dateTime={loan.loaned_at}>{formatLibraryDateTime(loan.loaned_at)}</time>
      </p>
      <p className="text-ink-muted">
        Vence el <time dateTime={loan.due_at}>{formatLibraryDateTime(loan.due_at)}</time>
      </p>
      <p className={statusClass(loan.overdue)}>Estado: {loanStatusLabel(loan, now)}</p>
    </article>
  );
}

/** Lista de «Mis préstamos» (spec F35, regla 2). */
export function MyLoansList({ loans, now }: { loans: MyLoan[]; now: Date }) {
  if (loans.length === 0) {
    return (
      <p role="status" className="mt-6">
        {MY_LOANS_MESSAGES.noLoans}
      </p>
    );
  }
  return (
    <>
      <p role="status" className="mt-6 font-semibold">
        {loanCountLabel(loans.length)}
      </p>
      {showsOverdueWarning(loans) && (
        <p role="alert" className="mt-2 font-semibold text-danger">
          Aviso: {MY_LOANS_MESSAGES.overdueWarning}{" "}
          <Link href="/mis-vencidos" className={LINK_CLASS}>
            Ver mis vencidos
          </Link>
        </p>
      )}
      <ul className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loans.map((loan) => (
          <li key={loan.loan_id}>
            <LoanCard loan={loan} now={now} />
          </li>
        ))}
      </ul>
    </>
  );
}

/** Lista de «Mis vencidos» (spec F35, regla 3). */
export function MyOverdueList({ overdue }: { overdue: OverdueLoansResponse }) {
  if (overdue.overdue_loans.length === 0) {
    return (
      <p role="status" className="mt-6">
        {MY_LOANS_MESSAGES.noOverdue}
      </p>
    );
  }
  return (
    <>
      <ul className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {overdue.overdue_loans.map((loan) => (
          <li key={loan.loan_id}>
            <article className={CARD_CLASS}>
              <h2 className="break-words text-lg font-semibold text-primary-strong">{myLoanTitle(loan)}</h2>
              {loan.book_author !== null && <p className="break-words">{loan.book_author}</p>}
              <p className="mt-2 text-ink-muted">
                Venció el <time dateTime={loan.due_at}>{formatLibraryDateTime(loan.due_at)}</time>
              </p>
              <p className="mt-2 font-semibold text-danger">{daysLateLabel(loan.days_late)}</p>
              <p className="font-semibold">Multa: {formatPesos(loan.fine_amount)}</p>
            </article>
          </li>
        ))}
      </ul>
      <p role="status" className="mt-6 text-lg font-bold">
        Total de multas: {formatPesos(overdue.total_fine_amount)}
      </p>
      <p className="mt-2">{MY_LOANS_MESSAGES.returnAtDesk}</p>
    </>
  );
}
