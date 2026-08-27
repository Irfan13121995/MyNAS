import { registerRootComponent } from 'expo';
import App from './App';

// Import background task definition to register with TaskManager at root bundle time
import './src/services/backgroundSync';

registerRootComponent(App);
