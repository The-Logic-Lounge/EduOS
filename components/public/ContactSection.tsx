import { ContactForm } from "./ContactForm";

export function ContactSection() {
  return (
    <section id="contact" className="border-t border-hairline bg-surface px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-2">
        <div>
          <span className="stat text-accent">Get in touch</span>
          <h2 className="mt-4 font-display text-title text-ink">Start a batch at your institute.</h2>
          <p className="mt-4 max-w-md text-ink-2">
            Whether you run a training centre or want to join a course, send us a message and our team will
            respond within 48 hours.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-ink-2">
            <li className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              Free, open enrolment programmes
            </li>
            <li className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              AI-supported instructor workflow
            </li>
            <li className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              Skill passports and career pathways
            </li>
          </ul>
        </div>
        <ContactForm />
      </div>
    </section>
  );
}
