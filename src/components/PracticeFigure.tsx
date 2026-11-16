import { Fragment } from 'react';
import stagePhoto from '@/assets/school_stage_photo.jpg.asset.json';
import type { PracticeFocus, PracticeRecap, PracticeSet } from '@/lib/practice-questions';
import { BoxFigure, type BoxSegment } from './BoxFigure';
import { MathText } from './MathText';

export function PracticeRecapPanel({ recap }: { recap: PracticeRecap }) {
  return <aside className="practice-recap" aria-label={recap.title}>
    <p className="practice-recap-title">{recap.title}</p>
    <dl>{recap.items.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.lines.map((line, index) => <Fragment key={line}>{index > 0 ? ', ' : null}<MathText text={line} /></Fragment>)}</dd></div>)}</dl>
  </aside>;
}

/** The picture a practice part is about: the 2D box drawing or the school stage photo, with an optional recap on its left. */
export function PracticeFigure({ set, highlight = null, compact = false, recap = set.recap, segments }: { set: PracticeSet; highlight?: PracticeFocus | null; compact?: boolean; recap?: PracticeRecap | null | undefined; segments?: readonly BoxSegment[] | undefined }) {
  const figure = set.figure === 'box' ? <BoxFigure highlight={highlight} compact={compact} segments={segments} /> : <figure className={`box-figure photo-figure ${compact ? 'box-figure-compact' : ''}`}>
    <img src={stagePhoto.url} alt="Sân khấu Trường Trung học phổ thông Trần Văn Bảy với biển tên trường, phông màn và sàn sân khấu" />
  </figure>;
  if (!recap) return figure;
  return <div className="practice-figure-row"><PracticeRecapPanel recap={recap} />{figure}</div>;
}
