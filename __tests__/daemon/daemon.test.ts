import Daemon from '../../src/daemon/main';
import axios from 'axios';
import { AdapterFactory } from '../../src/adapters';

// Mock axios post
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Daemon Preemptive Scheduling Loop via REST API', () => {
    let daemon: Daemon;

    beforeEach(() => {
        daemon = new Daemon();
        jest.clearAllMocks();
    });

    afterEach(() => {
        daemon.stop();
    });

    it('should fetch tasks via API, and send to worker', async () => {
        const mockTask = { id: 'task-1', project_id: 'p1', title: 'T1', objective: 'O1', lane: 'L1' };
        
        // First mock: claim task
        mockedAxios.post.mockResolvedValueOnce({ data: { task: mockTask } });
        // Second mock: send to worker
        mockedAxios.post.mockResolvedValueOnce({ status: 200 });

        await daemon.tick();

        // Check if axios was called to claim
        expect(mockedAxios.post).toHaveBeenNthCalledWith(
            1, 
            expect.stringContaining('/tasks/claim'), 
            {}, 
            expect.objectContaining({ headers: { Authorization: 'Bearer valid-token' } })
        );

        // Check if axios was called to dispatch to worker
        expect(mockedAxios.post).toHaveBeenNthCalledWith(
            2, 
            'http://localhost:8001/v1/webhook/artifacts', 
            expect.any(Object), 
            expect.objectContaining({ timeout: 3000 })
        );
    });
    
    it('should release task via API on worker dispatch failure', async () => {
        const mockTask = { id: 'task-2', project_id: 'p1', title: 'T2', objective: 'O2', lane: 'L1' };
        
        // First mock: claim task
        mockedAxios.post.mockResolvedValueOnce({ data: { task: mockTask } });
        // Second mock: worker failure
        mockedAxios.post.mockRejectedValueOnce(new Error('ConnectionRefused'));
        // Third mock: release task
        mockedAxios.post.mockResolvedValueOnce({ status: 200 });
        
        await daemon.tick();
        
        // Check if release was called
        expect(mockedAxios.post).toHaveBeenNthCalledWith(
            3,
            expect.stringContaining('/tasks/task-2/release'),
            {},
            expect.objectContaining({ headers: { Authorization: 'Bearer valid-token' } })
        );
    });

    it('should do nothing if no tasks are available (404)', async () => {
        // Mock 404 from API
        mockedAxios.post.mockRejectedValueOnce({ response: { status: 404 } });
        
        await daemon.tick();
        
        // Axios should only be called once for claim, worker/release shouldn't be called
        expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });
});
