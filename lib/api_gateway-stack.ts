import * as targets from '@aws-cdk/aws-events-targets';
import * as events from '@aws-cdk/aws-events';
import * as lambda from '@aws-cdk/aws-lambda';
import * as apigw from '@aws-cdk/aws-apigateway';
import * as iam from '@aws-cdk/aws-iam';
import * as cdk from '@aws-cdk/core';

export class JJRestAPIStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    const myLambda = new lambda.Function(this, "MyEventProcessor", {
      code: new lambda.InlineCode(`exports.handler = (event) => { console.log('event:', event); return {'statusCode': 200, 'body': event}; }`),
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_14_X
    })
    
    const bus = new events.EventBus(this, "MyLanguageBus")
    new cdk.CfnOutput(this, "BusName", {value: bus.eventBusName})
    
    new events.Rule(this, `LambdaProcessorRule`, {
        eventBus: bus,
        eventPattern: {source: [`com.amazon.alexa.english`]},
        targets: [new targets.LambdaFunction(myLambda)]
    })

    const apigwRole = new iam.Role(this, "MYAPIGWRole", {
      assumedBy: new iam.ServicePrincipal("apigateway"),
      inlinePolicies: {
        "putEvents": new iam.PolicyDocument({
          statements: [new iam.PolicyStatement({
            actions: ["events:PutEvents"],
            resources: [bus.eventBusArn]
          })]
        })
      }
    });

    const myRestAPI = new apigw.RestApi(
      this, 
      "JJRestAPI",
      {
        deployOptions: {
          loggingLevel: apigw.MethodLoggingLevel.INFO,
          dataTraceEnabled: true,
        },  
      }
    );

    const languageResource = myRestAPI.root.addResource("assembly");
    
    const options = {
      credentialsRole: apigwRole,
      requestParameters: {
        "integration.request.header.X-Amz-Target": "'AWSEvents.PutEvents'",
        "integration.request.header.Content-Type": "'application/x-amz-json-1.1'"
      },
      requestTemplates: {
        "application/json": `{"Entries": [{"Source": "com.amazon.alexa.english", "Detail": "$util.escapeJavaScript($input.json('$'))", "Resources": ["resource1", "resource2"], "DetailType": "myDetailType", "EventBusName": "${bus.eventBusName}"}]}`
      },
      integrationResponses: [{
        statusCode: "200",
        responseTemplates: {
          "application/json": ""
        }
      }]
    }
    
    languageResource.addMethod("ANY", new apigw.Integration({
      type: apigw.IntegrationType.AWS,
      uri: `arn:aws:apigateway:${cdk.Aws.REGION}:events:path//`,
      integrationHttpMethod: "ANY",
      options: options,
    }),
    {
      methodResponses: [{statusCode: "200"}]
    })
  }
}