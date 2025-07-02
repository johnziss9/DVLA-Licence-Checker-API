import axios from 'axios';

export interface DVLAAuthResponse {
    accessToken: string;
    tokenType: string;
    expiresIn: number;
}

export interface DVLALicenceResponse {
    drivingLicenceNumber: string;
    status: string;
    statusCode: string;
    licenceType: string;
    driver?: {
        drivingLicenceNumber: string;
        lastName: string;
        gender: string;
        firstNames: string;
        dateOfBirth: string;
        address: {
            unstructuredAddress: {
                line1: string;
                line2?: string;
                line3?: string;
                line4?: string;
                line5?: string;
                postcode: string;
            };
        };
    };
    licence?: {
        type: string;
        status: string;
    };
    licenceHolderDetails?: {
        title?: string;
        forename: string;
        middleNames?: string;
        surname: string;
        dateOfBirth: string;
        placeOfBirth?: string;
    };
    address?: {
        line1: string;
        line2?: string;
        line3?: string;
        line4?: string;
        line5?: string;
        postcode: string;
    };
    licenceDetails?: {
        issueDate: string;
        expiryDate: string;
        licenceNumber: string;
        photographyDate?: string;
        signatureDate?: string;
    };
    categories?: DVLACategory[];
    entitlement?: any[]; // DVLA uses this instead of categories
    endorsements?: DVLAEndorsement[];
    testPass?: any[];
    penaltyPoints?: number;
    disqualifications?: any[];
    restrictions?: any[];
    token?: {
        issueNumber: string;
        validFromDate: string;
        validToDate: string;
    };
    cpcDetails?: {
        cpcNumber: string;
        expiryDate: string;
        categories: string[];
    };
    tachographDetails?: {
        cardNumber: string;
        expiryDate: string;
        cardType: string;
    };
}

export interface DVLACategory {
    categoryCode: string; // What DVLA actually returns (e.g., "C", "D1", "CE")
    categoryLegalLiteral: string; // Description (e.g., "Medium sized goods vehicles")
    categoryType?: string; // "Full" or "Provisional" 
    validFromDate?: string; // When category became valid
    validToDate?: string; // When category expires (if applicable)
    expiryDate?: string; // Alternative name for validToDate
    fromDate?: string; // Alternative name for validFromDate
    restrictions?: Array<{
        restrictionCode: string;
        restrictionLiteral: string;
    }>;
    provisionalEntitlement?: boolean;
}

// For backward compatibility, we keep the legacy interface:
export interface DVLACategoryLegacy {
    code: string;
    category: string;
    validFromDate: string;
    validToDate: string;
    restrictions?: string[];
    provisionalEntitlement?: boolean;
}

export interface DVLAEndorsement {
    code: string;
    description: string;
    dateOfOffence: string;
    dateOfConviction: string;
    courtCode: string;
    penaltyPoints: number;
    endorsementText?: string;
}

export interface DVLACheckRequest {
    drivingLicenceNumber: string;
    includeCPC: boolean;
    includeTacho: boolean;
    acceptPartialResponse: string;
}

class DVLAService {
    private client: any;
    private readonly baseURL: string;
    private readonly username: string;
    private readonly password: string;
    private readonly apiKey: string;
    private accessToken: string | null = null;
    private tokenExpiry: Date | null = null;

    constructor() {
        this.baseURL = process.env.DVLA_API_URL || 'https://uat.driver-vehicle-licensing.api.gov.uk';
        this.username = process.env.DVLA_USERNAME!;
        this.password = process.env.DVLA_PASSWORD!;
        this.apiKey = process.env.DVLA_API_KEY!;

        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Add request interceptor for logging
        this.client.interceptors.request.use(
            (config: any) => {
                console.log(`DVLA API Request: ${config.method?.toUpperCase()} ${config.url}`);

                if (process.env.NODE_ENV === 'development') {
                    console.log('Request Headers:', JSON.stringify(config.headers, null, 2));
                    if (config.data && !config.url?.includes('/authenticate')) {
                        console.log('Request Data:', JSON.stringify(config.data, null, 2));
                    }
                }
                return config;
            },
            (error: any) => {
                console.error('DVLA API Request Error:', error);
                return Promise.reject(error);
            }
        );

        // Add response interceptor for logging and error handling
        this.client.interceptors.response.use(
            (response: any) => {
                console.log(`DVLA API Response: ${response.status} ${response.statusText}`);
                return response;
            },
            (error: any) => {
                console.error('DVLA API Error:', error.response?.data || error.message);
                return Promise.reject(this.handleDVLAError(error));
            }
        );
    }

    /**
     * Authenticate with DVLA API and get access token
     */
    private async authenticate(): Promise<DVLAAuthResponse> {
        try {
            console.log('=== DVLA AUTHENTICATION DEBUG ===');
            console.log('API URL:', this.baseURL);
            console.log('Username:', this.username);
            console.log('Password length:', this.password ? this.password.length : 'NOT SET');
            console.log('Full auth URL:', `${this.baseURL}/thirdparty-access/v1/authenticate`);

            const requestData = {
                userName: this.username,
                password: this.password,
            };

            console.log('Request data:', JSON.stringify(requestData, null, 2));

            const response: any = await this.client.post(
                '/thirdparty-access/v1/authenticate',
                requestData,
                {
                    headers: {
                        'Content-Type': 'application/json',
                    }
                }
            );

            console.log('Response status:', response.status);
            console.log('Response headers:', JSON.stringify(response.headers, null, 2));
            console.log('Response data:', JSON.stringify(response.data, null, 2));

            const responseData = response.data;
            const accessToken = responseData.accessToken ||
                responseData.access_token ||
                responseData['id-token'] || // DVLA uses this format
                responseData.token ||
                responseData.authToken ||
                responseData.jwt;

            if (!accessToken) {
                console.error('No access token found in response. Available properties:', Object.keys(responseData));
                throw new Error('No access token received from DVLA API');
            }

            console.log('Access token found:', accessToken.substring(0, 20) + '...');

            return {
                accessToken: accessToken,
                tokenType: responseData.tokenType || responseData.token_type || 'Bearer',
                expiresIn: responseData.expiresIn || responseData.expires_in || 3600
            };
        } catch (error: any) {
            console.error('=== DVLA AUTHENTICATION ERROR ===');
            console.error('Error type:', error.constructor.name);
            console.error('Error message:', error.message);

            if (error.response) {
                console.error('Error status:', error.response.status);
                console.error('Error headers:', JSON.stringify(error.response.headers, null, 2));
                console.error('Error data:', JSON.stringify(error.response.data, null, 2));
            } else if (error.request) {
                console.error('No response received');
                console.error('Request config:', JSON.stringify(error.config, null, 2));
            }

            throw new Error(`DVLA authentication failed: ${error.message}`);
        }
    }

    /**
     * Ensure we have a valid access token
     */
    private async ensureValidToken(): Promise<void> {
        const now = new Date();

        // Check if we need to get or refresh the token
        if (!this.accessToken || !this.tokenExpiry || now >= this.tokenExpiry) {
            console.log('Getting new DVLA access token...');

            try {
                const authResponse = await this.authenticate();
                this.accessToken = authResponse.accessToken;

                // Handle different possible expiry formats
                let expiresInMs: number;
                if (authResponse.expiresIn) {
                    // If expiresIn is provided, use it
                    expiresInMs = authResponse.expiresIn * 1000;
                } else {
                    // Default to 1 hour if no expiry is provided
                    expiresInMs = 60 * 60 * 1000;
                    console.log('No expiresIn provided, defaulting to 1 hour');
                }

                // Set expiry time (subtract 5 minutes for safety)
                this.tokenExpiry = new Date(now.getTime() + expiresInMs - (5 * 60 * 1000));

                console.log(`DVLA token obtained, expires at: ${this.tokenExpiry.toISOString()}`);
                console.log(`Token will be valid for: ${Math.round(expiresInMs / 1000 / 60)} minutes`);
            } catch (error) {
                console.error('Failed to authenticate with DVLA:', error);
                throw error; // Re-throw the original error
            }
        } else {
            console.log(`Using existing DVLA token, expires at: ${this.tokenExpiry.toISOString()}`);
        }
    }

    /**
     * Check a driving licence with the DVLA
     */
    async checkLicence(request: DVLACheckRequest): Promise<DVLALicenceResponse> {
        try {
            // Ensure we have a valid token
            await this.ensureValidToken();

            console.log('Making licence enquiry request...');
            console.log('Licence Number:', request.drivingLicenceNumber);

            const response: any = await this.client.post(
                '/full-driver-enquiry/v1/driving-licences/retrieve',
                {
                    drivingLicenceNumber: request.drivingLicenceNumber.toUpperCase().replace(/\s/g, ''),
                    includeCPC: request.includeCPC,
                    includeTacho: request.includeTacho,
                    acceptPartialResponse: request.acceptPartialResponse,
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': this.accessToken,
                        'X-API-Key': this.apiKey,
                    }
                }
            );

            console.log('Licence enquiry successful');
            return response.data;
        } catch (error) {
            console.error('Licence check failed:', error);
            throw error;
        }
    }

    /**
     * Validate licence number format
     */
    validateLicenceNumber(licenceNumber: string): boolean {
        // UK licence format: 5 letters, 6 digits, 2 letters, 2 digits
        const ukLicenceRegex = /^[A-Z]{5}[0-9]{6}[A-Z]{2}[0-9]{2}$/;
        const cleanLicence = licenceNumber.toUpperCase().replace(/\s/g, '');
        return ukLicenceRegex.test(cleanLicence);
    }

    /**
     * Handle DVLA API errors and convert to application errors
     */
    private handleDVLAError(error: any): Error {
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data as any;

            switch (status) {
                case 400:
                    return new Error(`Invalid request: ${data.message || data.error || 'Bad request to DVLA API'}`);
                case 401:
                    // Clear stored token on auth failure
                    this.accessToken = null;
                    this.tokenExpiry = null;
                    return new Error('DVLA API authentication failed - check credentials');
                case 403:
                    return new Error('DVLA API access forbidden - check API key and permissions');
                case 404:
                    return new Error('Licence not found - please check the licence number');
                case 429:
                    return new Error('DVLA API rate limit exceeded - please try again later');
                case 500:
                    return new Error('DVLA API server error - please try again later');
                case 502:
                case 503:
                case 504:
                    return new Error('DVLA API temporarily unavailable - please try again later');
                default:
                    return new Error(`DVLA API error (${status}): ${data.message || data.error || 'Unknown error'}`);
            }
        } else if (error.request) {
            return new Error('Failed to connect to DVLA API - please check your internet connection');
        } else {
            return new Error(`DVLA API request failed: ${error.message}`);
        }
    }

    /**
     * Test the connection to DVLA API by authenticating
     */
    async testConnection(): Promise<boolean> {
        try {
            await this.authenticate();
            return true;
        } catch (error) {
            console.error('DVLA API connection test failed:', error);
            return false;
        }
    }

    /**
     * Get current token status (for debugging)
     */
    getTokenStatus(): { hasToken: boolean; expiresAt: string | null } {
        return {
            hasToken: !!this.accessToken,
            expiresAt: this.tokenExpiry?.toISOString() || null,
        };
    }
}

export default new DVLAService();
export { DVLAService };