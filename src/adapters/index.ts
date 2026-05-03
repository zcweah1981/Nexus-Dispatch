import { Task } from '../db/dal';

export abstract class BaseAdapter {
    abstract buildPayload(task: Task): any;
}

export class OpenClawAdapter extends BaseAdapter {
    buildPayload(task: Task): any {
        return {
            model: "openclaw-v1",
            messages: [
                {
                    role: "system",
                    content: "You are an autonomous worker agent. Execute the objective and return the result via function call."
                },
                {
                    role: "user",
                    content: `Objective: ${task.objective}\nTask Title: ${task.title}`
                }
            ],
            tools: [
                {
                    type: "function",
                    function: {
                        name: "submit_artifact",
                        description: "Submit the execution result artifact",
                        parameters: task.payload_schema || { type: "object", properties: {} }
                    }
                }
            ],
            tool_choice: { type: "function", function: { name: "submit_artifact" } }
        };
    }
}

export class HermesMCPAdapter extends BaseAdapter {
    buildPayload(task: Task): any {
        return {
            jsonrpc: "2.0",
            method: "execute_task",
            params: {
                task_id: task.id,
                objective: task.objective,
                schema: task.payload_schema || {}
            },
            id: task.id
        };
    }
}

export class AdapterFactory {
    static getAdapter(adapterType: string): BaseAdapter {
        switch (adapterType.toLowerCase()) {
            case 'openclaw':
                return new OpenClawAdapter();
            case 'hermes_mcp':
            case 'hermesmcp':
                return new HermesMCPAdapter();
            default:
                throw new Error(`Unsupported adapter type: ${adapterType}`);
        }
    }
}
