export interface AdapterPayload {
    task_id: string;
    payload: any;
}

export abstract class BaseAdapter {
    abstract adapt(task: any): AdapterPayload;
}

export class OpenClawAdapter extends BaseAdapter {
    adapt(task: any): AdapterPayload {
        return {
            task_id: task.id,
            payload: {
                messages: [
                    {
                        role: "system",
                        content: `You are an OpenClaw Agent executing a task. You must return tool calls to perform actions.`
                    },
                    {
                        role: "user",
                        content: `Execute Task: ${task.title}\nDescription: ${task.description || ''}`
                    }
                ],
                tools: [
                    {
                        type: "function",
                        function: {
                            name: "submit_proof",
                            description: "Submit task completion proof",
                            parameters: {
                                type: "object",
                                properties: {
                                    proof: { type: "string" }
                                },
                                required: ["proof"]
                            }
                        }
                    }
                ]
            }
        };
    }
}

export class HermesMCPAdapter extends BaseAdapter {
    adapt(task: any): AdapterPayload {
        return {
            task_id: task.id,
            payload: {
                mcp_intent: "execute_task",
                task_id: task.id,
                parameters: {
                    title: task.title,
                    description: task.description || ''
                },
                expected_artifact: "mcp_tool_call"
            }
        };
    }
}

export class AdapterFactory {
    static get_adapter(adapter_type: string): BaseAdapter {
        if (adapter_type === 'openclaw') {
            return new OpenClawAdapter();
        } else if (adapter_type === 'hermes_mcp') {
            return new HermesMCPAdapter();
        }
        throw new Error(`Unsupported adapter type: ${adapter_type}`);
    }
}
