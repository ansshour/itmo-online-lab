import './styles/app.css';
import 'katex/dist/katex.min.css';
import { Application } from './app/application/application';

const rootElement = document.querySelector<HTMLDivElement>('#app');

if (!rootElement) {
  throw new Error('Application root was not found.');
}

const application = new Application(rootElement);

application.start();