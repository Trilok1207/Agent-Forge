import { Link } from 'react-router-dom';
import { appConfig } from '@/config/app';
import { VALUE_SOURCE_INFO, type ValueSource } from '@/core/provenance';
import { Disclaimer } from '../components/Disclaimer';
import { SourceBadge } from '../components/SourceBadge';

export function AboutPage() {
  return (
    <div className="page prose">
      <h1>How {appConfig.name} works</h1>
      <p>
        {appConfig.name} helps you explore operational decisions before making them. You describe a system — today, a
        warehouse — and the app simulates it so you can compare options such as adding staff, introducing robots, or
        changing how orders are picked.
      </p>

      <h2>What is a simulation here?</h2>
      <p>
        The app uses a <strong>discrete-event simulation</strong>: it steps through a shift event by event — an order arrives,
        a picker walks to a rack, picks items, hands them to packing — and counts what happens. Some inputs are random (for
        example, exactly when orders arrive), so the same setup is run several times with different, recorded random seeds.
        Running the same model with the same seed always gives the same result.
      </p>

      <h2>Where values come from</h2>
      <p>Every input shows its source, so you always know what is a fact and what is a guess:</p>
      <ul>
        {(Object.keys(VALUE_SOURCE_INFO) as ValueSource[]).map((s) => (
          <li key={s}>
            <SourceBadge source={s} /> {VALUE_SOURCE_INFO[s].description}
          </li>
        ))}
      </ul>

      <h2>Limitations</h2>
      <ul>
        <li>The model is deliberately simple. It leaves out many real-world effects (fatigue, breakdowns, stock-outs, detailed congestion).</li>
        <li>Results are only as good as the inputs and assumptions. Review defaults before relying on any number.</li>
        <li>Differences between scenarios in the model do not prove that the same change would cause the same effect in reality.</li>
        <li>Projects are stored in this browser only. Clearing browser data removes them.</li>
      </ul>
      <Disclaimer />
      <p>
        <Link className="btn btn--primary" to="/">
          Go to projects
        </Link>
      </p>
    </div>
  );
}
