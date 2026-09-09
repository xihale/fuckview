// user-service 类型（analysis/02-auth-and-login.md）

export interface School {
    id: number | string;
    name?: string;
    [k: string]: unknown;
}

/** 登录响应里的学生对象（字段远不止这些，按需扩展） */
export interface Student {
    id: number | string;
    name?: string;
    email?: string | null;
    schoolId?: number | string;
    token?: string;
    [k: string]: unknown;
}

/** POST /user-service/login（multipart 表单字段） */
export interface UserLoginRequest {
    /** 学生固定 3 */
    roleId: number;
    username: string;
    /** RSA(`${密码},${Date.now()}`) 的密文 */
    password: string;
    /** 广工 = 63；游客 = -1 */
    schoolId: number;
}

export interface UserLoginResponse {
    student: Student;
    token: string;
}
