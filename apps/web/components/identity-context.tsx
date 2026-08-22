import { BrandMark } from './public-chrome';

interface IdentityContextItem {
  title: string;
  detail: string;
}

interface IdentityContextProps {
  eyebrow: string;
  heading: string;
  description: string;
  headingId: string;
  headingLevel?: 'h1' | 'h2';
  items: readonly IdentityContextItem[];
}

export function IdentityContext({
  eyebrow,
  heading,
  description,
  headingId,
  headingLevel = 'h2',
  items,
}: Readonly<IdentityContextProps>) {
  const Heading = headingLevel;
  return (
    <aside className={'auth-context'} aria-labelledby={headingId}>
      <BrandMark priority />
      <p className={'eyebrow'}>{eyebrow}</p>
      <Heading id={headingId}>{heading}</Heading>
      <p>{description}</p>
      <ol>
        {items.map((item, index) => (
          <li key={item.title}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <div>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}
